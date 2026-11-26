import Foundation
import Observation
import SwiftUI
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
    /// Tapped and shown ticked, but not yet checked off: a second tap within the wait takes it back.
    private(set) var ticked: Set<Int> = []
    @ObservationIgnored private var waiting: [Int: Task<Void, Never>] = [:]
    /// Checked off since the list last settled: shown ticked where they sat, so the rows below don't jump up.
    private(set) var kept: Set<Int> = []
    @ObservationIgnored private var layout: Layout?
    #if DEBUG
    @ObservationIgnored private var debugFired = false
    #endif

    override init() {
        super.init()
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// Ticks an item; it's checked off after a short wait unless tapped again first.
    func tap(_ item: Item) {
        guard !kept.contains(item.id) else { return }
        WKInterfaceDevice.current().play(.click)
        if let timer = waiting.removeValue(forKey: item.id) {
            timer.cancel()
            ticked.remove(item.id)
            return
        }
        ticked.insert(item.id)
        waiting[item.id] = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(graceSeconds))
            guard !Task.isCancelled else { return }
            self?.finish(item)
        }
    }

    /// Lets the checked-off rows go (the app is back on screen).
    func settle() {
        layout = nil
        show()
    }

    /// Checks off everything still waiting (the app is leaving the screen).
    func finishAll() {
        let items = groups.flatMap(\.items).filter { ticked.contains($0.id) }
        for item in items { finish(item) }
    }

    private func finish(_ item: Item) {
        waiting.removeValue(forKey: item.id)?.cancel()
        ticked.remove(item.id)
        withAnimation { checkOff(item) }
    }

    func checkOff(_ item: Item) {
        checked.insert(item.id)
        show()
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
        let hidden = received?.hiddenReasons ?? []
        let open = (received?.groups ?? []).compactMap { group in
            let items = group.items.filter { !$0.done && $0.isShown(hidden: hidden) && !checked.contains($0.id) }
            return items.isEmpty ? nil : ItemGroup(title: group.title, holds: group.holds, items: items)
        }
        let openIDs = Set(open.flatMap(\.items).map(\.id))
        let all = (received?.groups.flatMap(\.items) ?? []) + (received?.done ?? [])
        let wasThere = Set(layout?.ids ?? [])
        let keep = all.filter { wasThere.contains($0.id) && !openIDs.contains($0.id) && ($0.done || checked.contains($0.id)) && $0.isShown(hidden: hidden) }
        kept = Set(keep.map(\.id))
        groups = placing(keep, into: open, layout: layout)
        if received != nil { layout = Layout(groups: groups) }
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
