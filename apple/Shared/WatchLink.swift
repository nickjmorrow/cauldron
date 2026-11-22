import Foundation

/// What the phone and Watch say to each other over WatchConnectivity (dictionaries of property-list values).
enum WatchLink {
    // Phone -> Watch, as the application context: the latest list and when the phone got it from the server.
    static func context(list: ShoppingList, updated: Date) -> [String: Any] {
        ["list": (try? JSONEncoder().encode(list)) ?? Data(), "updated": updated.timeIntervalSince1970]
    }

    static func readContext(_ context: [String: Any]) -> (list: ShoppingList, updated: Date)? {
        guard let data = context["list"] as? Data,
              let list = try? JSONDecoder().decode(ShoppingList.self, from: data),
              let updated = context["updated"] as? TimeInterval else { return nil }
        return (list, Date(timeIntervalSince1970: updated))
    }

    // Watch -> phone, as a user-info transfer (and a message when the phone is reachable): one item checked off or back on.
    static func check(id: Int, done: Bool) -> [String: Any] {
        ["check": id, "done": done]
    }

    static func readCheck(_ message: [String: Any]) -> (id: Int, done: Bool)? {
        guard let id = message["check"] as? Int, let done = message["done"] as? Bool else { return nil }
        return (id, done)
    }
}
