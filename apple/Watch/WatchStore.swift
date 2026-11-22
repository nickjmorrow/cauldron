import Foundation
import Observation
import WatchConnectivity
import WatchKit

/// The Watch's copy of the list. It only ever comes from the phone; check-offs go back through the phone.
@Observable
final class WatchStore: NSObject, WCSessionDelegate {
    private(set) var groups: [ItemGroup] = []
    private(set) var updated: Date?
    /// Checked off here and sent, but the phone hasn't yet pushed a list without them.
    @ObservationIgnored private var checked: Set<Int> = []
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
        let message = WatchLink.check(id: item.id, done: true)
        // The transfer is queued by the system and survives the phone being out of reach; the message is the fast path.
        WCSession.default.transferUserInfo(message)
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(message, replyHandler: nil, errorHandler: nil)
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
            let items = group.items.filter { !$0.done && !checked.contains($0.id) }
            return items.isEmpty ? nil : ItemGroup(title: group.title, items: items)
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        take(session.receivedApplicationContext)
    }

    func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        take(context)
    }
}
