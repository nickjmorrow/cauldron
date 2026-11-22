import AppKit
import SwiftUI
import UniformTypeIdentifiers

/// The shopping list on the Mac: the same list, queue and sync as the phone (Store), laid out for a window.
struct MacShoppingView: View {
    var store: Store
    @State private var showDone = false
    @AppStorage("showLater") private var showLater = false
    @State private var viewing: Item?
    @State private var laterUndo = LaterUndo()
    @Environment(\.undoManager) private var undoManager

    private var groups: [ItemGroup] { store.list.visibleGroups(showLater: showLater, keep: laterUndo.keep) }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            Divider()
            ScrollView {
                // Plain headings that scroll with the list (a List pins them under the title bar).
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(groups) { group in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(group.title).font(.headline).foregroundStyle(Theme.muted)
                            if let holds = group.aisleHolds {
                                Text(holds).font(.callout).foregroundStyle(Theme.muted.opacity(0.8)).lineLimit(1)
                            }
                        }
                            .padding(.top, 18).padding(.bottom, 6).padding(.horizontal, 4)
                        card(group.items)
                    }
                    if !store.list.done.isEmpty { doneSection }
                }
                .padding(.horizontal, 20).padding(.bottom, 24)
            }
            .overlay {
                if groups.isEmpty && store.list.done.isEmpty {
                    Text(store.list.laterCount > 0 ? "Nothing for this trip. Everything left is for later." : "Nothing on the list.")
                        .foregroundStyle(Theme.muted)
                }
            }
            .overlay(alignment: .bottom) {
                if let item = laterUndo.item {
                    UndoNote(text: "\(item.name) is set for later") { laterUndo.undo(in: store, undo: undoManager) }
                        .padding(.bottom, 14)
                }
            }
            .animation(.snappy, value: laterUndo.item?.id)
        }
        .task { await store.sync() }
        .onReceive(NotificationCenter.default.publisher(for: .reload)) { _ in Task { await store.sync() } }
        .onReceive(NotificationCenter.default.publisher(for: .toggleLater)) { _ in withAnimation { showLater.toggle() } }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            Task { await store.sync() }
        }
        .toolbar {
            Button { Task { await store.sync() } } label: { Label("Refresh", systemImage: "arrow.clockwise") }
        }
        .sheet(item: $viewing) { item in
            VStack {
                AsyncImage(url: store.photoURL(item)) { $0.resizable().scaledToFit() } placeholder: { ProgressView() }
                    .frame(minWidth: 480, minHeight: 480)
                Button("Done") { viewing = nil }.keyboardShortcut(.defaultAction)
            }
            .padding()
        }
    }

    /// Pinned above the list, so it's in reach however far down you are: adding an item, and the later switch (also ⌘L).
    private var topBar: some View {
        let open = store.list.groups.reduce(0) { $0 + $1.items.filter { !$0.later }.count }
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                MacAddBar { name, aisle, later in store.add(name: name, aisle: aisle, later: later) }
                Divider().frame(height: 22)
                Button { withAnimation { showLater.toggle() } } label: {
                    Label(showLater ? "Hide later" : "Later (\(store.list.laterCount))", systemImage: showLater ? "clock.fill" : "clock")
                }
                .buttonStyle(.bordered)
                .disabled(store.list.laterCount == 0 && !showLater)
                .help(showLater ? "Hide items left for a later trip (⌘L)" : "Show \(store.list.laterCount) items left for a later trip (⌘L)")
            }
            HStack {
                Text(open == 1 ? "1 item this trip" : "\(open) items this trip").font(.caption).foregroundStyle(Theme.muted)
                status
            }
        }
        .padding(.horizontal, 20).padding(.vertical, 10)
    }

    /// One group's rows on a rounded card, with hairlines between rows.
    private func card(_ items: [Item]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index > 0 { Divider().overlay(Theme.line).padding(.leading, 44) }
                row(item).padding(.horizontal, 12)
            }
        }
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.line, lineWidth: 1))
    }

    private var doneSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Button { withAnimation { showDone.toggle() } } label: {
                    Label("Done (\(store.list.done.count))", systemImage: showDone ? "chevron.down" : "chevron.right")
                        .font(.headline).foregroundStyle(Theme.muted)
                }
                .buttonStyle(.plain)
                Spacer()
                if showDone { Button("Clear done", role: .destructive) { store.clearDone() }.foregroundStyle(Theme.bad) }
            }
            .padding(.top, 18).padding(.horizontal, 4)
            if showDone { card(store.list.done) }
        }
    }

    private func row(_ item: Item) -> some View {
        HStack(spacing: 12) {
            Button { ShoppingUndo.setDone(item, !item.done, store: store, undo: undoManager) } label: { CheckMark(done: item.done, size: 20) }
                .buttonStyle(.plain)
                .accessibilityLabel(item.done ? "Put \(item.name) back" : "Check off \(item.name)")
            // One line across the row: name, amount and note, then (on the right) lookup, meal tag and photo.
            Text(item.name)
                .foregroundStyle(item.done || item.later ? Theme.muted : Theme.fg)
                .strikethrough(item.done, color: Theme.muted)
                .lineLimit(1)
                .layoutPriority(2)
            let detail = [item.qty, item.note].filter { !$0.isEmpty }.joined(separator: " · ")
            if !detail.isEmpty {
                Text(detail).font(.callout).foregroundStyle(Theme.muted).lineLimit(1).truncationMode(.tail).layoutPriority(1)
            }
            Spacer(minLength: 12)
            if item.isLooking { LookingNote() }
            if let meals = item.meals, !meals.isEmpty { MealTag(meals: meals) }
            if let url = store.photoURL(item) {
                Button { viewing = item } label: {
                    AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Theme.raised }
                        .frame(width: 26, height: 26)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Photo of \(item.name)")
            }
            if !item.done {
                Button { laterUndo.toggle(item, in: store, undo: undoManager) } label: {
                    Image(systemName: item.later ? "clock.fill" : "clock")
                        .foregroundStyle(item.later ? Theme.sun : Theme.muted)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(item.later ? "Later: click to get it this trip" : "Click to leave it for later")
                .accessibilityLabel(item.later ? "Get \(item.name) this trip" : "Leave \(item.name) for later")
            }
        }
        .padding(.vertical, 5)
        .contextMenu {
            Button(item.later ? "Move to this trip" : "Move to later") { laterUndo.toggle(item, in: store, undo: undoManager) }
            Button("Choose photo…") { choosePhoto(for: item) }
            if item.photo?.isEmpty == false {
                Button("Remove photo") { Task { await store.removePhoto(item.id) } }
            }
            Divider()
            Button("Delete", role: .destructive) { ShoppingUndo.delete(item, store: store, undo: undoManager) }
        }
    }

    @ViewBuilder private var status: some View {
        if let error = store.error {
            Text(error).font(.caption).foregroundStyle(Theme.bad)
        }
        if !store.pending.isEmpty {
            Text(store.pending.count == 1 ? "1 change waiting" : "\(store.pending.count) changes waiting")
                .font(.caption).foregroundStyle(Theme.muted)
        }
    }

    private func choosePhoto(for item: Item) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.image]
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url, let image = NSImage(contentsOf: url),
              let jpeg = image.jpeg(fitting: 1600) else { return }
        Task { await store.setPhoto(item.id, jpeg: jpeg) }
    }
}

private extension NSImage {
    /// JPEG no larger than `side` pixels on its longer edge, so uploads stay small (as on the phone).
    func jpeg(fitting side: CGFloat) -> Data? {
        guard let cg = cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
        let scale = min(1, side / CGFloat(max(cg.width, cg.height)))
        let w = Int(CGFloat(cg.width) * scale), h = Int(CGFloat(cg.height) * scale)
        guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4,
                                         hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)
        else { return nil }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        NSGraphicsContext.current?.cgContext.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        NSGraphicsContext.restoreGraphicsState()
        return rep.representation(using: .jpeg, properties: [.compressionFactor: 0.75])
    }
}

/// Name, optional aisle and a "later" toggle; Return adds the item.
private struct MacAddBar: View {
    var add: (_ name: String, _ aisle: String, _ later: Bool) -> Void
    @State private var name = ""
    @State private var aisle = ""
    @State private var later = false
    @FocusState private var nameFocused: Bool

    var body: some View {
        HStack(spacing: 8) {
            TextField("Add item", text: $name).focused($nameFocused).onSubmit(submit)
            TextField("Aisle", text: $aisle).frame(width: 90).onSubmit(submit)
            Toggle("Later", isOn: $later)
            Button("Add", action: submit).keyboardShortcut(.defaultAction).disabled(trimmed.isEmpty)
        }
        .textFieldStyle(.roundedBorder)
    }

    private var trimmed: String { name.trimmingCharacters(in: .whitespaces) }

    private func submit() {
        guard !trimmed.isEmpty else { return }
        add(trimmed, aisle.trimmingCharacters(in: .whitespaces), later)
        name = ""; aisle = ""; later = false
        nameFocused = true
    }
}
