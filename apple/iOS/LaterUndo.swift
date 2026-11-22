import SwiftUI

/// Keeps track of the item most recently set for later, so it stays on screen with an Undo for a few seconds.
@MainActor @Observable
final class LaterUndo {
    private(set) var item: Item?
    private(set) var keep: Set<Int> = []
    private var timer: Task<Void, Never>?
    static let seconds = 6.0

    /// Sets or clears "later" for an item. Setting it shows the undo note and keeps the item visible meanwhile.
    func toggle(_ item: Item, in store: Store) {
        let later = !item.later
        store.setLater(item.id, later)
        if later { show(item) } else { keep.remove(item.id); if self.item?.id == item.id { dismiss() } }
    }

    func undo(in store: Store) {
        guard let item else { return }
        store.setLater(item.id, false)
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
