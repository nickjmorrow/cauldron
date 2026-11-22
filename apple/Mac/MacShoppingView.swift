import AppKit
import SwiftUI
import UniformTypeIdentifiers

/// The shopping list on the Mac: the same list, queue and sync as the phone (Store), laid out for a window.
struct MacShoppingView: View {
    var store: Store
    @State private var showDone = false
    @AppStorage("showLater") private var showLater = false
    @State private var viewing: Item?

    var body: some View {
        VStack(spacing: 0) {
            List {
                ForEach(store.list.visibleGroups(showLater: showLater)) { group in
                    Section(group.title) {
                        ForEach(group.items) { row($0) }
                    }
                }
                if !store.list.done.isEmpty {
                    Section {
                        DisclosureGroup("Done (\(store.list.done.count))", isExpanded: $showDone) {
                            ForEach(store.list.done) { row($0) }
                            Button("Clear done", role: .destructive) { store.clearDone() }
                                .foregroundStyle(Theme.bad)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .overlay {
                if store.list.visibleGroups(showLater: showLater).isEmpty && store.list.done.isEmpty {
                    Text(store.list.laterCount > 0 ? "Nothing for this trip. Everything left is for later." : "Nothing on the list.")
                        .foregroundStyle(Theme.muted)
                }
            }
            Divider()
            VStack(spacing: 6) {
                status
                MacAddBar { name, aisle, later in store.add(name: name, aisle: aisle, later: later) }
            }
            .padding(12)
        }
        .task { await store.sync() }
        .onReceive(NotificationCenter.default.publisher(for: .reload)) { _ in Task { await store.sync() } }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            Task { await store.sync() }
        }
        .toolbar {
            if store.list.laterCount > 0 {
                Toggle(isOn: $showLater) {
                    Label(showLater ? "Hide later" : "Show later (\(store.list.laterCount))", systemImage: showLater ? "clock.fill" : "clock")
                }
                .toggleStyle(.button)
                .help("Show or hide items left for a later trip")
            }
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

    private func row(_ item: Item) -> some View {
        HStack(spacing: 12) {
            Button { store.setDone(item.id, !item.done) } label: { CheckMark(done: item.done, size: 20) }
                .buttonStyle(.plain)
                .accessibilityLabel(item.done ? "Put \(item.name) back" : "Check off \(item.name)")
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name)
                    .foregroundStyle(item.done || item.later ? Theme.muted : Theme.fg)
                    .strikethrough(item.done, color: Theme.muted)
                let detail = [item.qty, item.note].filter { !$0.isEmpty }.joined(separator: " · ")
                if !detail.isEmpty { Text(detail).font(.callout).foregroundStyle(Theme.muted) }
                if let meals = item.forMeals { Text(meals).font(.callout.italic()).foregroundStyle(Theme.sun) }
                if item.isLooking {
                    HStack(spacing: 6) { ProgressView().controlSize(.mini); Text("Finding its aisle…") }
                        .font(.footnote).foregroundStyle(Theme.muted)
                }
            }
            .fixedSize(horizontal: false, vertical: true) // macOS list rows otherwise keep a two-line height and clip the meals line
            Spacer(minLength: 0)
            if let url = store.photoURL(item) {
                Button { viewing = item } label: {
                    AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Theme.raised }
                        .frame(width: 36, height: 36)
                        .clipShape(RoundedRectangle(cornerRadius: 7))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Photo of \(item.name)")
            }
            if !item.done {
                Button { store.setLater(item.id, !item.later) } label: {
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
        .padding(.vertical, 3)
        .contextMenu {
            Button(item.later ? "Move to this trip" : "Move to later") { store.setLater(item.id, !item.later) }
            Button("Choose photo…") { choosePhoto(for: item) }
            if item.photo?.isEmpty == false {
                Button("Remove photo") { Task { await store.removePhoto(item.id) } }
            }
            Divider()
            Button("Delete", role: .destructive) { store.delete(item.id) }
        }
    }

    @ViewBuilder private var status: some View {
        if let error = store.error {
            Text(error).font(.footnote).foregroundStyle(Theme.bad).frame(maxWidth: .infinity, alignment: .leading)
        }
        if !store.pending.isEmpty {
            Text(store.pending.count == 1 ? "1 change waiting" : "\(store.pending.count) changes waiting")
                .font(.footnote).foregroundStyle(Theme.muted).frame(maxWidth: .infinity, alignment: .leading)
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
