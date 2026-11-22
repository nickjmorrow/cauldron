import SwiftUI

struct ListScreen: View {
    var store: Store
    @Environment(\.scenePhase) private var scenePhase
    @State private var showDone = false
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            List {
                ForEach(store.list.groups) { group in
                    Section {
                        ForEach(group.items) { item in row(item) }
                    } header: {
                        Text(group.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.muted)
                    }
                }
                if !store.list.done.isEmpty { doneSection }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.bg)
            .overlay {
                if store.list.groups.isEmpty && store.list.done.isEmpty {
                    Text("Nothing on the list.").foregroundStyle(Theme.muted)
                }
            }
            .refreshable { await store.sync() }
            .navigationTitle("Shopping")
            .toolbarBackground(Theme.bg, for: .navigationBar)
            .toolbar {
                Button { showSettings = true } label: { Image(systemName: "gearshape") }
                    .accessibilityLabel("Settings")
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
        }
        .task { await store.sync() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await store.sync() } }
        }
    }

    private func row(_ item: Item) -> some View {
        Button { store.setDone(item.id, !item.done) } label: {
            HStack(spacing: 14) {
                CheckMark(done: item.done)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name)
                        .font(.title3.weight(.medium))
                        .foregroundStyle(item.done ? Theme.muted : Theme.fg)
                        .strikethrough(item.done, color: Theme.muted)
                    let detail = [item.qty, item.note].filter { !$0.isEmpty }.joined(separator: " · ")
                    if !detail.isEmpty {
                        Text(detail).font(.subheadline).foregroundStyle(Theme.muted)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowBackground(Theme.surface)
        .listRowSeparatorTint(Theme.line)
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { store.delete(item.id) } label: { Label("Delete", systemImage: "trash") }
            Button { store.setLater(item.id, !item.later) } label: {
                Label(item.later ? "Now" : "Later", systemImage: item.later ? "arrow.uturn.up" : "clock")
            }
            .tint(Theme.raised)
        }
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
