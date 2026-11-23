import Foundation
import Observation

/// The phone's copy of the list, the queue of changes not yet on the server, and the server address.
@MainActor @Observable
final class Store {
    private(set) var list = ShoppingList()
    private(set) var updated: Date?
    private(set) var error: String?
    private(set) var pending: [Write] = []
    /// Called whenever the list changes, so it can be relayed to the Watch.
    @ObservationIgnored var onChange: (ShoppingList, Date) -> Void = { _, _ in }

    @ObservationIgnored private let defaults = UserDefaults.standard
    @ObservationIgnored private var syncing = false
    @ObservationIgnored private var syncAgain = false

    init() {
        if let data = defaults.data(forKey: "pending"), let saved = try? JSONDecoder().decode([Write].self, from: data) {
            pending = saved
        }
        if let data = defaults.data(forKey: "list"), let saved = try? JSONDecoder().decode(ShoppingList.self, from: data) {
            list = saved
            updated = defaults.object(forKey: "updated") as? Date
        }
    }

    // MARK: Server address

    /// From Info.plist, which generate.sh fills from .env.
    static let defaultServerURL = (Bundle.main.object(forInfoDictionaryKey: "CauldronURL") as? String) ?? ""

    /// The override typed into settings; empty means use the default.
    var serverOverride: String {
        get { defaults.string(forKey: "serverURL") ?? "" }
        set { defaults.set(newValue.trimmingCharacters(in: .whitespaces), forKey: "serverURL") }
    }

    /// The server in use: the override if set, else the built-in address. Nil when neither is a usable URL.
    var serverURL: URL? {
        let text = serverOverride.isEmpty ? Self.defaultServerURL : serverOverride
        guard let url = URL(string: text), url.scheme != nil, url.host != nil else { return nil }
        return url
    }

    private var api: API? { serverURL.map { API(base: $0) } }

    func photoURL(_ item: Item) -> URL? { api?.photoURL(item) }

    // MARK: Photos (sent at once; a failure is shown, not queued)

    func setPhoto(_ id: Int, jpeg: Data) async {
        guard let api else { error = "Set the server address in settings."; return }
        do {
            try await api.putPhoto(id, jpeg: jpeg)
            await sync()
        } catch let refused as Refused {
            error = "Server refused the photo: \(refused.message)"
        } catch {
            self.error = "Can't reach the server, so the photo wasn't saved."
        }
    }

    func findPhoto(_ id: Int) async {
        guard let api else { error = "Set the server address in settings."; return }
        do {
            try await api.findPhoto(id)
            await sync()
        } catch let refused as Refused {
            error = refused.message
        } catch {
            self.error = "Can't reach the server, so no product photo was found."
        }
    }

    func removePhoto(_ id: Int) async {
        guard let api else { return }
        do {
            try await api.deletePhoto(id)
            await sync()
        } catch {
            self.error = "Can't reach the server, so the photo wasn't removed."
        }
    }

    // MARK: Changes (shown at once, then sent)

    func setDone(_ id: Int, _ done: Bool) {
        list.update(id) { $0.done = done }
        submit(.patch(id, ["done": done]))
    }

    func setLater(_ id: Int, _ later: Bool) {
        list.update(id) { $0.later = later }
        submit(.patch(id, ["later": later]))
    }

    func delete(_ id: Int) {
        list.remove(id)
        submit(.delete(id))
    }

    func add(name: String, aisle: String, later: Bool) {
        submit(.add(name: name, aisle: aisle, later: later))
    }

    /// Puts a deleted item back with the same details (it gets a new id).
    func restore(_ item: Item) {
        submit(.restore(item))
    }

    func clearDone() {
        list.done.removeAll { $0.done }
        submit(.clearDone)
    }

    private func submit(_ write: Write) {
        pending.append(write)
        savePending()
        onChange(list, updated ?? .now)
        Task { await sync() }
    }

    // MARK: Sync

    /// Sends waiting changes in order, then fetches the list. One run at a time; a call during a run asks for one more.
    func sync() async {
        if syncing { syncAgain = true; return }
        syncing = true
        defer { syncing = false }
        repeat {
            syncAgain = false
            await syncOnce()
        } while syncAgain
    }

    private func syncOnce() async {
        guard let api else { error = "Set the server address in settings."; return }
        while let next = pending.first {
            do {
                try await api.call(next)
            } catch let refused as Refused {
                // The server said no (e.g. the item is already gone); retrying would never succeed, so drop it.
                if refused.status != 404 { error = "Server refused a change: \(refused.message)" }
            } catch {
                self.error = "Can't reach the server."
                return
            }
            pending.removeFirst()
            savePending()
        }
        do {
            let fresh = try await api.list()
            // A change made while the fetch was in flight is newer than this answer; the next run will fetch again.
            guard pending.isEmpty else { syncAgain = true; return }
            list = fresh
            updated = .now
            error = nil
            defaults.set(try? JSONEncoder().encode(fresh), forKey: "list")
            defaults.set(updated, forKey: "updated")
            onChange(fresh, updated ?? .now)
            if fresh.anyLooking { scheduleLookupCheck() }
        } catch is Refused {
            error = "The server answered with an error."
        } catch is DecodingError {
            error = "The server sent something unexpected."
        } catch {
            self.error = "Can't reach the server."
        }
    }

    /// While the server is still looking up an aisle, fetch again shortly so the item moves to its aisle on its own.
    @ObservationIgnored private var lookupCheck: Task<Void, Never>?
    private func scheduleLookupCheck() {
        guard lookupCheck == nil else { return }
        lookupCheck = Task {
            try? await Task.sleep(for: .seconds(2))
            lookupCheck = nil
            await sync()
        }
    }

    private func savePending() {
        defaults.set(try? JSONEncoder().encode(pending), forKey: "pending")
    }
}
