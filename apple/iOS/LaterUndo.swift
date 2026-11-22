import SwiftUI

/// Keeps track of the item most recently set for later, so it stays on screen with an Undo for a few seconds.
@MainActor @Observable
final class LaterUndo {
    private(set) var item: Item?
    private(set) var keep: Set<Int> = []
    private var timer: Task<Void, Never>?
    static let seconds = 6.0

    /// Sets or clears "later" for an item. Setting it shows the undo note and keeps the item visible meanwhile.
    func toggle(_ item: Item, in store: Store, undo: UndoManager?) {
        let later = !item.later
        ShoppingUndo.setLater(item, later, store: store, undo: undo)
        if later { show(item) } else { keep.remove(item.id); if self.item?.id == item.id { dismiss() } }
    }

    func undo(in store: Store, undo: UndoManager?) {
        guard let item else { return }
        ShoppingUndo.setLater(item, false, store: store, undo: undo)
        dismiss()
    }

    private func show(_ item: Item) {
        self.item = item
        keep.insert(item.id)
        timer?.cancel()
        timer = Task { [weak self] in
            try? await Task.sleep(for: .seconds(Self.seconds))
            guard !Task.isCancelled else { return }
            self?.dismiss()
        }
    }

    private func dismiss() {
        timer?.cancel()
        withAnimation { item = nil; keep = [] }
    }
}

/// Shopping changes that ⌘Z (Edit ▸ Undo; shake on the phone) can take back: checking off, later/now and deleting.
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

    static func setLater(_ item: Item, _ later: Bool, store: Store, undo: UndoManager?) {
        store.setLater(item.id, later)
        undo?.registerUndo(withTarget: store) { store in
            MainActor.assumeIsolated { setLater(item, !later, store: store, undo: undo) }
        }
        undo?.setActionName(later ? "Move \(item.name) to Later" : "Move \(item.name) to This Trip")
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
