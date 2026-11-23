import SwiftUI

/// A tap on a checkbox shows at once but only takes effect after a short wait, so a slip can be tapped back
/// before the row moves. Until then the change lives here, not in the store.
@MainActor @Observable
final class Grace {
    enum Mark: Equatable { case done(Bool) }

    private(set) var marks: [Int: Mark] = [:]
    @ObservationIgnored private var waiting: [Int: (apply: () -> Void, timer: Task<Void, Never>)] = [:]

    /// The item as its row should show it: with its waiting change, if any.
    func shown(_ item: Item) -> Item {
        var item = item
        switch marks[item.id] {
        case .done(let done): item.done = done
        case nil: break
        }
        return item
    }

    func toggleDone(_ item: Item, in store: Store, undo: UndoManager?) {
        toggle(item.id, .done(!item.done)) { ShoppingUndo.setDone(item, !item.done, store: store, undo: undo) }
    }

    /// Applies every waiting change now (the app is going to the background or quitting).
    func applyAll() {
        for id in Array(waiting.keys) { apply(id) }
    }

    private func toggle(_ id: Int, _ mark: Mark, apply change: @escaping () -> Void) {
        // A second tap on the same control takes the waiting change back.
        if marks[id] == mark {
            waiting.removeValue(forKey: id)?.timer.cancel()
            marks[id] = nil
            return
        }
        apply(id) // a change to the other control was waiting: it goes through first
        marks[id] = mark
        let timer = Task { [weak self] in
            try? await Task.sleep(for: .seconds(graceSeconds))
            guard !Task.isCancelled else { return }
            self?.apply(id)
        }
        waiting[id] = (change, timer)
    }

    private func apply(_ id: Int) {
        guard let entry = waiting.removeValue(forKey: id) else { return }
        entry.timer.cancel()
        withAnimation { marks[id] = nil; entry.apply() }
    }
}

/// Shopping changes that ⌘Z (Edit ▸ Undo; shake on the phone) can take back: checking off and deleting.
/// Each registers its opposite with the window's undo manager, so undo and redo walk back and forth.
@MainActor
enum ShoppingUndo {
    static func setDone(_ item: Item, _ done: Bool, store: Store, undo: UndoManager?) {
        store.setDone(item.id, done)
        undo?.registerUndo(withTarget: store) { store in
            MainActor.assumeIsolated { setDone(item, !done, store: store, undo: undo) }
        }
        undo?.setActionName(done ? "Check Off \(item.name)" : "Uncheck \(item.name)")
    }

    /// Undoing a delete puts the item back with the same details; that can't be redone (the new copy has a new id).
    static func delete(_ item: Item, store: Store, undo: UndoManager?) {
        store.delete(item.id)
        undo?.registerUndo(withTarget: store) { store in
            MainActor.assumeIsolated { store.restore(item) }
        }
        undo?.setActionName("Delete \(item.name)")
    }
}
