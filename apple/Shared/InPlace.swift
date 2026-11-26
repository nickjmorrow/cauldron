import Foundation

/// Where every open item sat when the list last settled. Items checked off since then stay in their place, crossed
/// out, instead of moving to Done and shifting the rows under your thumb. The list settles when you come back to it,
/// refresh it or tidy it up. (The web does the same with a cookie: lib/shopping.ts groupItems `kept`.)
struct Layout: Equatable {
    struct Group: Equatable { var title: String; var holds: String?; var ids: [Int] }
    var groups: [Group]

    init(_ list: ShoppingList) {
        groups = list.groups.map { Group(title: $0.title, holds: $0.holds, ids: $0.items.filter { !$0.done }.map(\.id)) }
    }

    init(groups: [ItemGroup]) {
        self.groups = groups.map { Group(title: $0.title, holds: $0.holds, ids: $0.items.map(\.id)) }
    }

    var ids: [Int] { groups.flatMap(\.ids) }
}

extension ShoppingList {
    /// Items that were open when the list settled and are done now: they're shown in their old place, not under Done.
    func keptIDs(_ layout: Layout?) -> Set<Int> {
        guard let layout else { return [] }
        let done = Set(self.done.filter(\.done).map(\.id))
        return Set(layout.ids.filter(done.contains))
    }

    /// The visible groups, with the kept items put back where they sat (crossed out).
    func visibleGroups(focus: String? = nil, keeping layout: Layout?) -> [ItemGroup] {
        placing(done.filter { keptIDs(layout).contains($0.id) && $0.isShown(hidden: hiddenReasons, focus: focus) },
                into: visibleGroups(focus: focus), layout: layout)
    }

    /// The layout as it is on screen now: the kept items where they sat, plus anything that has come onto the list since
    /// (added, unchecked, or sent by another device), so those stay put too when they're checked off.
    func following(_ layout: Layout?) -> Layout {
        Layout(groups: placing(done.filter { keptIDs(layout).contains($0.id) }, into: groups, layout: layout))
    }

    /// Done items that aren't being kept in place.
    func doneSection(keeping layout: Layout?) -> [Item] {
        let kept = keptIDs(layout)
        return done.filter { !kept.contains($0.id) }
    }
}

/// Puts each item back into its old group, after the item that sat above it (or first); a group that has emptied comes
/// back after the group that came before it.
func placing(_ items: [Item], into groups: [ItemGroup], layout: Layout?) -> [ItemGroup] {
    guard let layout, !items.isEmpty else { return groups }
    let byID = Dictionary(items.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    var result = groups
    for (g, old) in layout.groups.enumerated() {
        for (i, id) in old.ids.enumerated() {
            guard let item = byID[id] else { continue }
            var at = result.firstIndex { $0.title == old.title }
            if at == nil {
                let before = layout.groups[..<g].reversed().lazy.compactMap { prev in result.firstIndex { $0.title == prev.title } }.first
                let index = before.map { $0 + 1 } ?? 0
                result.insert(ItemGroup(title: old.title, holds: old.holds, items: []), at: index)
                at = index
            }
            guard let at, !result[at].items.contains(where: { $0.id == id }) else { continue }
            let above = old.ids[..<i].reversed().lazy.compactMap { prev in result[at].items.firstIndex { $0.id == prev } }.first
            result[at].items.insert(item, at: above.map { $0 + 1 } ?? 0)
        }
    }
    return result
}
