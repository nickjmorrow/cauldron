import Foundation
import WatchConnectivity

/// The phone's end of the Watch link: pushes the list as the application context, receives check-offs.
final class PhoneSession: NSObject, WCSessionDelegate {
    private let store: Store
    private var latest: [String: Any]?

    @MainActor
    init(store: Store) {
        self.store = store
        super.init()
        guard WCSession.isSupported() else { return }
        latest = WatchLink.context(list: store.list, updated: store.updated ?? .now)
        store.onChange = { [weak self] list, updated in self?.push(WatchLink.context(list: list, updated: updated)) }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    private func push(_ context: [String: Any]) {
        latest = context
        guard WCSession.default.activationState == .activated else { return }
        try? WCSession.default.updateApplicationContext(context)
    }

    private func receive(_ message: [String: Any]) {
        guard let check = WatchLink.readCheck(message) else { return }
        Task { @MainActor in store.setDone(check.id, check.done) }
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async { if let latest = self.latest { self.push(latest) } }
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) { receive(userInfo) }
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { receive(message) }

    /// The Watch app was installed (or the Watch paired) after the last push, which had nowhere to go.
    func sessionWatchStateDidChange(_ session: WCSession) {
        DispatchQueue.main.async { if let latest = self.latest { self.push(latest) } }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }
}
