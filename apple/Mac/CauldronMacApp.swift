import SwiftUI

@main
struct CauldronMacApp: App {
    @State private var store = Store()

    var body: some Scene {
        WindowGroup {
            MainView(store: store)
                .preferredColorScheme(.dark)
                .tint(Theme.sun)
                .frame(minWidth: 760, minHeight: 520)
        }
        .commands {
            CommandGroup(after: .toolbar) {
                Button("Reload") { NotificationCenter.default.post(name: .reload, object: nil) }
                    .keyboardShortcut("r")
            }
        }
        Settings {
            MacSettings(store: store)
                .preferredColorScheme(.dark)
        }
    }
}

extension Notification.Name {
    static let reload = Notification.Name("CauldronReload")
}

/// The sidebar's places: the native shopping list, and the planner pages, which are the server's web pages until they get native screens.
enum Place: String, CaseIterable, Identifiable {
    case shopping, day, meals, recipes, ingredients, kitchen, targets, review
    var id: String { rawValue }

    var title: String {
        switch self {
        case .shopping: "Shopping"
        case .day: "Day"
        case .meals: "Meals"
        case .recipes: "Recipes"
        case .ingredients: "Ingredients"
        case .kitchen: "Kitchen"
        case .targets: "Targets"
        case .review: "Review"
        }
    }

    var symbol: String {
        switch self {
        case .shopping: "cart"
        case .day: "sun.max"
        case .meals: "fork.knife"
        case .recipes: "book"
        case .ingredients: "carrot"
        case .kitchen: "refrigerator"
        case .targets: "target"
        case .review: "checklist"
        }
    }

    /// The web page shown for a planner place; nil for native screens.
    var webPath: String? {
        switch self {
        case .shopping: nil
        case .day: "/days"
        default: "/\(rawValue)"
        }
    }
}

struct MainView: View {
    var store: Store
    @SceneStorage("place") private var place: Place = .shopping

    var body: some View {
        NavigationSplitView {
            List(selection: Binding(get: { place }, set: { if let p = $0 { place = p } })) {
                Section("Lists") { row(.shopping) }
                Section("Planner") { ForEach(Place.allCases.filter { $0 != .shopping }) { row($0) } }
            }
            .navigationSplitViewColumnWidth(min: 170, ideal: 190)
        } detail: {
            Group {
                if let path = place.webPath {
                    if let base = store.serverURL {
                        WebPage(url: base.appending(path: path))
                    } else {
                        Text("Set the server address in Settings (⌘,).").foregroundStyle(Theme.muted)
                    }
                } else {
                    MacShoppingView(store: store)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.bg)
            .navigationTitle(place.title)
        }
    }

    private func row(_ p: Place) -> some View {
        Label(p.title, systemImage: p.symbol).tag(p)
    }
}

struct MacSettings: View {
    var store: Store
    @State private var url = ""

    var body: some View {
        Form {
            TextField("Server address", text: $url, prompt: Text(Store.defaultServerURL.isEmpty ? "https://…" : Store.defaultServerURL))
            Text("Leave empty to use the built-in address.").font(.footnote).foregroundStyle(.secondary)
            Button("Save") {
                store.serverOverride = url
                Task { await store.sync() }
                NotificationCenter.default.post(name: .reload, object: nil)
            }
        }
        .padding(20)
        .frame(width: 420)
        .onAppear { url = store.serverOverride }
    }
}
