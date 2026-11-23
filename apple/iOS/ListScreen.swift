import PhotosUI
import SwiftUI

struct ListScreen: View {
    var store: Store
    @Environment(\.scenePhase) private var scenePhase
    @State private var showDone = false
    @AppStorage("showLater") private var showLater = false
    @State private var grace = Grace()
    @Environment(\.undoManager) private var undoManager
    @State private var showSettings = false
    @State private var photoFor: Item?          // the item a photo is being taken or chosen for
    @State private var choosingPhoto = false
    @State private var takingPhoto = false
    @State private var pickedPhoto: PhotosPickerItem?
    @State private var viewing: Item?           // the item whose photo is shown full screen

    var body: some View {
        NavigationStack {
            List {
                ForEach(store.list.visibleGroups(showLater: showLater)) { group in
                    Section {
                        ForEach(group.items) { item in row(item) }
                    } header: {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(group.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
                            if let holds = group.aisleHolds {
                                Text(holds).font(.caption).foregroundStyle(Theme.muted.opacity(0.8)).textCase(nil)
                            }
                        }
                    }
                }
                if !store.list.done.isEmpty { doneSection }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.bg)
            .overlay {
                if store.list.visibleGroups(showLater: showLater).isEmpty && store.list.done.isEmpty {
                    Text(store.list.laterCount > 0 ? "Nothing for this trip.\nEverything left is for later." : "Nothing on the list.")
                        .multilineTextAlignment(.center).foregroundStyle(Theme.muted)
                }
            }
            .refreshable { await store.sync() }
            .navigationTitle("Shopping")
            .toolbarBackground(Theme.bg, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if store.list.laterCount > 0 || showLater {
                        Button { withAnimation { showLater.toggle() } } label: {
                            Label(showLater ? "Hide later" : "Later (\(store.list.laterCount))", systemImage: showLater ? "clock.fill" : "clock")
                                .labelStyle(.titleAndIcon)
                        }
                        .accessibilityLabel(showLater ? "Hide later items" : "Show \(store.list.laterCount) later items")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSettings = true } label: { Image(systemName: "gearshape") }
                        .accessibilityLabel("Settings")
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 6) {
                    status
                    AddBar { name, aisle, later in store.add(name: name, aisle: aisle, later: later) }
                }
                .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 8)
                .background(Theme.bg)
            }
            .sheet(isPresented: $showSettings) { SettingsSheet(store: store) }
            .photosPicker(isPresented: $choosingPhoto, selection: $pickedPhoto, matching: .images)
            .onChange(of: pickedPhoto) { _, picked in
                guard let picked, let item = photoFor else { return }
                pickedPhoto = nil
                Task {
                    if let data = try? await picked.loadTransferable(type: Data.self), let image = UIImage(data: data) { await upload(image, for: item) }
                }
            }
            .fullScreenCover(isPresented: $takingPhoto) {
                CameraView { image in
                    takingPhoto = false
                    if let image, let item = photoFor { Task { await upload(image, for: item) } }
                }
                .ignoresSafeArea()
            }
            .sheet(item: $viewing) { item in PhotoViewer(url: store.photoURL(item), title: item.name) }
        }
        .task { await store.sync() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await store.sync() } } else { grace.applyAll() }
        }
    }

    private func upload(_ image: UIImage, for item: Item) async {
        guard let jpeg = image.shrunk(toFit: 1600).jpegData(compressionQuality: 0.75) else { return }
        await store.setPhoto(item.id, jpeg: jpeg)
    }

    private func row(_ stored: Item) -> some View {
        let item = grace.shown(stored)
        return HStack(spacing: 0) {
            Button { grace.toggleDone(stored, in: store, undo: undoManager) } label: {
                CheckMark(done: item.done).frame(height: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(item.done ? "Put \(item.name) back" : "Check off \(item.name)")
            // The clock sits beside the checkbox it belongs to. It stays (dimmed) while a check-off waits, so the row doesn't shift.
            if !stored.done {
                Button { grace.toggleLater(stored, in: store, undo: undoManager) } label: {
                    Image(systemName: item.later ? "clock.fill" : "clock")
                        .font(.title3)
                        .foregroundStyle(item.later ? Theme.sun : Theme.muted)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(item.done)
                .opacity(item.done ? 0.35 : 1)
                .accessibilityLabel(item.later ? "Get \(item.name) this trip" : "Leave \(item.name) for later")
            }
            nameButton(item, stored: stored).padding(.leading, stored.done ? 14 : 0)
            if let url = store.photoURL(item) {
                Button { viewing = item } label: { Thumbnail(url: url) }
                    .buttonStyle(.plain)
                    .padding(.leading, 12)
                    .accessibilityLabel("Photo of \(item.name)")
            }
        }
        .listRowBackground(Theme.surface)
        .listRowSeparatorTint(Theme.line)
        .contextMenu {
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button { photoFor = item; takingPhoto = true } label: { Label("Take photo", systemImage: "camera") }
            }
            Button { photoFor = item; choosingPhoto = true } label: { Label("Choose photo", systemImage: "photo") }
            Button { Task { await store.findPhoto(item.id) } } label: { Label("Find product photo", systemImage: "magnifyingglass") }
            if item.photo?.isEmpty == false {
                Button(role: .destructive) { Task { await store.removePhoto(item.id) } } label: { Label("Remove photo", systemImage: "trash") }
            }
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { ShoppingUndo.delete(stored, store: store, undo: undoManager) } label: { Label("Delete", systemImage: "trash") }
            Button { grace.toggleLater(stored, in: store, undo: undoManager) } label: {
                Label(item.later ? "Now" : "Later", systemImage: item.later ? "arrow.uturn.up" : "clock")
            }
            .tint(Theme.raised)
        }
    }

    /// The name and details: tapping them checks the item off, like the checkbox.
    private func nameButton(_ item: Item, stored: Item) -> some View {
        Button { grace.toggleDone(stored, in: store, undo: undoManager) } label: {
            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name)
                        .font(.title3.weight(.medium))
                        .foregroundStyle(item.done || item.later ? Theme.muted : Theme.fg)
                        .strikethrough(item.done, color: Theme.muted)
                    let detail = [item.qty, item.note].filter { !$0.isEmpty }.joined(separator: " · ")
                    if !detail.isEmpty || item.meals?.isEmpty == false {
                        HStack(spacing: 8) {
                            if !detail.isEmpty { Text(detail).font(.subheadline).foregroundStyle(Theme.muted).lineLimit(1) }
                            if let meals = item.meals, !meals.isEmpty { MealTag(meals: meals) }
                        }
                    }
                    if item.isLooking { LookingNote() }
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var doneSection: some View {
        Section {
            if showDone {
                ForEach(store.list.done) { item in row(item) }
                Button("Clear done", role: .destructive) { store.clearDone() }
                    .font(.subheadline)
                    .foregroundStyle(Theme.bad)
                    .listRowBackground(Theme.surface)
            }
        } header: {
            Button { withAnimation { showDone.toggle() } } label: {
                HStack {
                    Text("Done (\(store.list.done.count))")
                    Spacer()
                    Image(systemName: "chevron.right").rotationEffect(.degrees(showDone ? 90 : 0))
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Theme.muted)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
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
}

private struct Thumbnail: View {
    var url: URL

    var body: some View {
        AsyncImage(url: url) { image in
            image.resizable().scaledToFill()
        } placeholder: {
            Theme.raised
        }
        .frame(width: 48, height: 48)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

private struct PhotoViewer: View {
    var url: URL?
    var title: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            AsyncImage(url: url) { image in
                image.resizable().scaledToFit()
            } placeholder: {
                ProgressView()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.bg)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

/// The system camera, for a photo of something on the list. Calls back with nil when cancelled.
private struct CameraView: UIViewControllerRepresentable {
    var done: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ picker: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(done: done) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let done: (UIImage?) -> Void
        init(done: @escaping (UIImage?) -> Void) { self.done = done }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            done(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { done(nil) }
    }
}

private extension UIImage {
    /// A copy no larger than `side` points on its longer edge, so uploads stay small.
    func shrunk(toFit side: CGFloat) -> UIImage {
        let scale = min(1, side / max(size.width, size.height))
        guard scale < 1 else { return self }
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
    }
}

/// Name, optional aisle and a "later" toggle; Return or the plus button adds the item.
private struct AddBar: View {
    var add: (_ name: String, _ aisle: String, _ later: Bool) -> Void
    @State private var name = ""
    @State private var aisle = ""
    @State private var later = false
    @FocusState private var nameFocused: Bool

    var body: some View {
        HStack(spacing: 8) {
            TextField("Add item", text: $name)
                .focused($nameFocused)
                .submitLabel(.done)
                .onSubmit(submit)
                .padding(.horizontal, 12).frame(height: 44)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12))
            TextField("Aisle", text: $aisle)
                .multilineTextAlignment(.center)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .onSubmit(submit)
                .frame(width: 60, height: 44)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12))
            Button { later.toggle() } label: {
                Image(systemName: "clock")
                    .frame(width: 44, height: 44)
                    .foregroundStyle(later ? Theme.sunInk : Theme.muted)
                    .background(later ? Theme.sun : Theme.surface, in: RoundedRectangle(cornerRadius: 12))
            }
            .accessibilityLabel("Later")
            .accessibilityAddTraits(later ? .isSelected : [])
            Button(action: submit) {
                Image(systemName: "plus").font(.body.weight(.semibold))
                    .frame(width: 44, height: 44)
                    .foregroundStyle(Theme.sunInk)
                    .background(Theme.sun, in: RoundedRectangle(cornerRadius: 12))
            }
            .accessibilityLabel("Add")
            .disabled(trimmed.isEmpty)
            .opacity(trimmed.isEmpty ? 0.4 : 1)
        }
        .foregroundStyle(Theme.fg)
    }

    private var trimmed: String { name.trimmingCharacters(in: .whitespaces) }

    private func submit() {
        guard !trimmed.isEmpty else { return }
        add(trimmed, aisle.trimmingCharacters(in: .whitespaces), later)
        name = ""; aisle = ""; later = false
        nameFocused = true
    }
}

private struct SettingsSheet: View {
    var store: Store
    @Environment(\.dismiss) private var dismiss
    @State private var url = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(Store.defaultServerURL.isEmpty ? "https://…" : Store.defaultServerURL, text: $url)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .listRowBackground(Theme.surface)
                } header: {
                    Text("Server address")
                } footer: {
                    Text("Leave empty to use the built-in address.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.bg)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        store.serverOverride = url
                        dismiss()
                        Task { await store.sync() }
                    }
                }
            }
            .onAppear { url = store.serverOverride }
        }
        .presentationDetents([.medium])
    }
}
