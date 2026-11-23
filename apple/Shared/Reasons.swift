import SwiftUI

/// Stands for items with no reason, in the list of hidden reasons.
let noReason = ""

/// One chip above the list: a reason on the list, how many open items have it, and whether it's shown this trip.
struct ReasonChip: Identifiable, Hashable {
    var reason: String
    var count: Int
    var shown: Bool
    var id: String { reason }
    var title: String { reason == noReason ? "No reason" : reason }
}

extension Item {
    var reasons: [String] { meals ?? [] }
    func has(_ reason: String) -> Bool { reasons.contains { $0.caseInsensitiveCompare(reason) == .orderedSame } }

    /// On this trip when one of its reasons is switched on; with no reason it follows the "No reason" chip.
    /// (lib/shopping.ts isShown)
    func isShown(hidden: [String]) -> Bool {
        let off = Set(hidden.map { $0.lowercased() })
        if reasons.isEmpty { return !off.contains(noReason) }
        return reasons.contains { !off.contains($0.lowercased()) }
    }
}

extension ShoppingList {
    var hiddenReasons: [String] { hidden ?? [] }
    private var open: [Item] { groups.flatMap(\.items) }

    /// The groups without the items hidden this trip; groups left empty are dropped.
    func visibleGroups() -> [ItemGroup] {
        groups.compactMap { group in
            let items = group.items.filter { $0.isShown(hidden: hiddenReasons) }
            return items.isEmpty ? nil : ItemGroup(title: group.title, holds: group.holds, items: items)
        }
    }

    var hiddenCount: Int { open.filter { !$0.isShown(hidden: hiddenReasons) }.count }

    /// Every reason to offer in a picker: the server's list, plus any on an item it hasn't heard about yet.
    var knownReasons: [String] {
        var known = reasons ?? []
        for reason in open.flatMap(\.reasons) where !known.contains(where: { $0.caseInsensitiveCompare(reason) == .orderedSame }) {
            known.append(reason)
        }
        return known
    }

    /// A chip per reason on the list (or switched off), then one for items with no reason.
    var chips: [ReasonChip] {
        let items = open
        var chips = knownReasons.compactMap { reason -> ReasonChip? in
            let count = items.filter { $0.has(reason) }.count
            let shown = !hiddenReasons.contains(reason)
            return count > 0 || !shown ? ReasonChip(reason: reason, count: count, shown: shown) : nil
        }
        let bare = items.filter(\.reasons.isEmpty).count
        if bare > 0 || hiddenReasons.contains(noReason) {
            chips.append(ReasonChip(reason: noReason, count: bare, shown: !hiddenReasons.contains(noReason)))
        }
        return chips
    }
}

#if !os(watchOS)
/// The chips in a row that scrolls sideways. Brass = shown this trip; outlined and struck through = hidden.
struct ReasonChips: View {
    var chips: [ReasonChip]
    var toggle: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(chips) { chip in
                    Button { toggle(chip.reason) } label: {
                        HStack(spacing: 6) {
                            Text(chip.title).strikethrough(!chip.shown)
                            Text("\(chip.count)").font(.caption).opacity(0.75)
                        }
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(chip.shown ? Theme.sun : Theme.muted)
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(chip.shown ? Theme.sun.opacity(0.12) : .clear, in: Capsule())
                        .overlay(Capsule().strokeBorder(chip.shown ? Theme.sun.opacity(0.35) : Theme.line, lineWidth: 1))
                        .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(chip.title), \(chip.count) items")
                    .accessibilityValue(chip.shown ? "shown" : "hidden")
                }
            }
        }
    }
}

/// What an item is for: every known reason as a checkbox, and a field that adds a new one on Return.
/// `done` is called with the picked reasons each time they change.
struct ReasonPicker: View {
    var title: String
    @State var known: [String]
    @State var picked: [String]
    var done: ([String]) -> Void
    @State private var new = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(title).font(.headline).foregroundStyle(Theme.fg).lineLimit(1)
                Spacer()
                Button("Done") { addNew(); dismiss() }
            }
            HStack(spacing: 8) {
                TextField("New reason", text: $new).onSubmit(addNew).textFieldStyle(.plain)
                    .foregroundStyle(Theme.fg)
                    .padding(.horizontal, 10).frame(height: 36)
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Theme.line, lineWidth: 1))
                Button("Add", action: addNew).disabled(trimmed.isEmpty)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(known, id: \.self) { reason in
                        Button { toggle(reason) } label: {
                            HStack(spacing: 12) {
                                CheckMark(done: isPicked(reason), size: 22)
                                Text(reason).foregroundStyle(Theme.fg)
                                Spacer(minLength: 0)
                            }
                            .frame(minHeight: 40)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(isPicked(reason) ? .isSelected : [])
                    }
                }
            }
        }
        .padding(16)
        .frame(minWidth: 280, minHeight: 320)
        // Saved as it changes, so swiping the sheet away keeps what was picked.
        .onChange(of: picked) { _, now in done(now) }
        .background(Theme.bg)
    }

    private var trimmed: String { new.trimmingCharacters(in: .whitespaces) }
    private func isPicked(_ reason: String) -> Bool { picked.contains { $0.caseInsensitiveCompare(reason) == .orderedSame } }

    private func toggle(_ reason: String) {
        if isPicked(reason) { picked.removeAll { $0.caseInsensitiveCompare(reason) == .orderedSame } } else { picked.append(reason) }
    }

    /// A typed reason joins the list already ticked; typing one that exists just ticks it.
    private func addNew() {
        guard !trimmed.isEmpty else { return }
        let existing = known.first { $0.caseInsensitiveCompare(trimmed) == .orderedSame }
        if existing == nil { known.insert(trimmed, at: 0) }
        if !isPicked(trimmed) { picked.append(existing ?? trimmed) }
        new = ""
    }
}
#endif
