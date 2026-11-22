import SwiftUI

@main
struct CauldronWatchApp: App {
    @State private var store = WatchStore()

    var body: some Scene {
        WindowGroup {
            WatchList(store: store).tint(Theme.sun)
        }
    }
}

struct WatchList: View {
    var store: WatchStore

    var body: some View {
        NavigationStack {
            List {
                ForEach(store.groups) { group in
                    Section {
                        ForEach(group.items) { item in
                            Button { withAnimation { store.checkOff(item) } } label: { row(item) }
                                .listRowBackground(RoundedRectangle(cornerRadius: 14).fill(Theme.raised))
                        }
                    } header: {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(group.title).font(.footnote.weight(.semibold)).foregroundStyle(Theme.sun)
                            if let holds = group.aisleHolds {
                                Text(holds).font(.caption2).foregroundStyle(Theme.muted).textCase(nil).lineLimit(2)
                            }
                        }
                    }
                }
                Section {
                } footer: {
                    Text(footer).font(.footnote).foregroundStyle(Theme.muted).frame(maxWidth: .infinity)
                }
            }
            .navigationTitle("Shopping")
            .containerBackground(Theme.bg.gradient, for: .navigation)
        }
    }

    private func row(_ item: Item) -> some View {
        HStack(spacing: 10) {
            CheckMark(done: false, size: 22)
            VStack(alignment: .leading, spacing: 1) {
                Text(item.name).font(.title3.weight(.medium)).foregroundStyle(Theme.fg)
                let detail = [item.qty, item.note].filter { !$0.isEmpty }.joined(separator: " · ")
                if !detail.isEmpty {
                    Text(detail).font(.footnote).foregroundStyle(Theme.muted)
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .padding(.vertical, 4)
    }

    private var footer: String {
        guard let updated = store.updated else { return "Open Cauldron on your iPhone to load the list." }
        let time = "updated " + updated.formatted(date: .omitted, time: .shortened)
        return store.groups.isEmpty ? "Nothing on the list.\n\(time)" : time
    }
}
