import Foundation
import Observation
import WatchConnectivity
import WatchKit

/// The Watch's copy of the list. It only ever comes from the phone; check-offs go back through the phone.
@Observable
final class WatchStore: NSObject, WCSessionDelegate {
    private(set) var groups: [ItemGroup] = []
    private(set) var updated: Date?
    /// Checked off here, but the phone hasn't yet pushed a list without them. Saved, so a check-off made out of the
    /// phone's reach survives the app being closed, and sent again each time the phone comes back in reach.
    @ObservationIgnored private var checked: Set<Int> = Set(UserDefaults.standard.array(forKey: "checked") as? [Int] ?? []) {
        didSet { UserDefaults.standard.set(Array(checked), forKey: "checked") }
    }
    @ObservationIgnored private var received: ShoppingList?
    #if DEBUG
    @ObservationIgnored private var debugFired = false
    #endif

    override init() {
        super.init()
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func checkOff(_ item: Item) {
        checked.insert(item.id)
        show()
        WKInterfaceDevice.current().play(.click)
        // The system-queued transfer is a backup: in the simulator it never reached the phone app, so the check-off is
        // also kept in `checked` and sent as a message whenever the phone is reachable (see sendUnconfirmed).
        WCSession.default.transferUserInfo(WatchLink.check(id: item.id, done: true))
        sendUnconfirmed()
    }

    /// Sends every check-off the phone hasn't confirmed yet. Sending one twice is harmless: the phone just marks it done again.
    private func sendUnconfirmed() {
        guard WCSession.default.activationState == .activated, WCSession.default.isReachable else { return }
        for id in checked {
            WCSession.default.sendMessage(WatchLink.check(id: id, done: true), replyHandler: nil, errorHandler: nil)
        }
    }

    private func take(_ context: [String: Any]) {
        guard let (list, updated) = WatchLink.readContext(context) else { return }
        DispatchQueue.main.async {
            self.received = list
            self.updated = updated
            // Forget check-offs the phone has caught up with.
            let stillListed = Set(list.groups.flatMap(\.items).filter { !$0.done }.map(\.id))
            self.checked.formIntersection(stillListed)
            self.show()
            self.sendUnconfirmed()
            #if DEBUG
            // Simulators can't be tapped from a script: `simctl launch <watch> <bundle id> -debugCheckOff <id>` checks one item
            // off once, two seconds after the list arrives so the phone has had time to become reachable.
            let id = UserDefaults.standard.integer(forKey: "debugCheckOff")
            guard !self.debugFired else { return }
            self.debugFired = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                if let item = self.groups.flatMap(\.items).first(where: { $0.id == id }) { self.checkOff(item) }
            }
            #endif
        }
    }

    private func show() {
        groups = (received?.groups ?? []).compactMap { group in
            let items = group.items.filter { !$0.done && !$0.later && !checked.contains($0.id) }
            return items.isEmpty ? nil : ItemGroup(title: group.title, holds: group.holds, items: items)
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        take(session.receivedApplicationContext)
    }

    func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        take(context)
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async { self.sendUnconfirmed() }
    }
}
