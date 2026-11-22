import Foundation

/// One line of the shopping list, as the server sends it.
struct Item: Codable, Identifiable, Hashable {
    var id: Int
    var name: String
    var qty: String = ""
    var aisle: String = ""
    var later: Bool = false
    var done: Bool = false
    var note: String = ""
    /// When the item's photo was set, or "" when it has none. Optional so lists saved before photos existed still load.
    var photo: String? = nil
}

/// A section of the list ("Aisle 4", "No aisle yet", "Later"). The server sorts and groups; clients show them as given.
struct ItemGroup: Codable, Hashable, Identifiable {
    var title: String
    var items: [Item]
    var id: String { title }
}

struct ShoppingList: Codable, Hashable {
    var groups: [ItemGroup] = []
    var done: [Item] = []

    /// Marks an item in place, wherever it is, without moving it between sections.
    mutating func update(_ id: Int, _ change: (inout Item) -> Void) {
        for g in groups.indices {
            for i in groups[g].items.indices where groups[g].items[i].id == id { change(&groups[g].items[i]) }
        }
        for i in done.indices where done[i].id == id { change(&done[i]) }
    }

    mutating func remove(_ id: Int) {
        for g in groups.indices { groups[g].items.removeAll { $0.id == id } }
        groups.removeAll { $0.items.isEmpty }
        done.removeAll { $0.id == id }
    }
}
