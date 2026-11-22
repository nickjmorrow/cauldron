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
    /// The server is looking up which aisle it's in at the store. Optional (like meals) so older saved lists still load.
    var looking: Bool? = nil
    /// The meals or recipes it's bought for.
    var meals: [String]? = nil

    var isLooking: Bool { looking ?? false }
    var forMeals: String? {
        guard let meals, !meals.isEmpty else { return nil }
        return "for " + meals.joined(separator: ", ")
    }
}

/// A section of the list ("Aisle 4", "Produce", "No aisle yet"). The server sorts and groups; clients show them as given,
/// leaving out "later" items unless asked to show them.
struct ItemGroup: Codable, Hashable, Identifiable {
    var title: String
    /// What the aisle holds ("Pasta, condiments"), when known. Optional so lists saved before it existed still load.
    var holds: String? = nil
    var items: [Item]
    var id: String { title }
    var aisleHolds: String? { holds.flatMap { $0.isEmpty ? nil : $0 } }
}

struct ShoppingList: Codable, Hashable {
    var groups: [ItemGroup] = []
    var done: [Item] = []

    /// Marks an item in place, wherever it is, without moving it between sections.
    /// The groups with "later" items left out unless `showLater` (items in `keep` always stay, so one just set for later
    /// can still be undone where it is); groups left empty are dropped.
    func visibleGroups(showLater: Bool, keep: Set<Int> = []) -> [ItemGroup] {
        groups.compactMap { group in
            let items = showLater ? group.items : group.items.filter { !$0.later || keep.contains($0.id) }
            return items.isEmpty ? nil : ItemGroup(title: group.title, holds: group.holds, items: items)
        }
    }

    var laterCount: Int { groups.reduce(0) { $0 + $1.items.filter(\.later).count } }
    var anyLooking: Bool { groups.contains { $0.items.contains(where: \.isLooking) } }

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
