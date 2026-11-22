import SwiftUI

@main
struct CauldronApp: App {
    @State private var store: Store
    // Kept alive for the life of the app so check-offs from the Watch arrive even when no screen is showing.
    private let watch: PhoneSession

    init() {
        let store = Store()
        _store = State(initialValue: store)
        watch = PhoneSession(store: store)
    }

    var body: some Scene {
        WindowGroup {
            ListScreen(store: store)
                .preferredColorScheme(.dark)
                .tint(Theme.sun)
        }
    }
}
