import SwiftUI
import WebKit

/// A server page in the window: the planner screens live here until they are rebuilt natively.
struct WebPage: NSViewRepresentable {
    var url: URL

    func makeCoordinator() -> Coordinator { Coordinator() }

    /// Inside the app the sidebar is the navigation, so the page's own top bar goes. The page's fade-in starts at
    /// opacity 0 and WebKit pauses animations in a window that isn't on screen, which left pages blank; pages show at once here.
    private static let appStyle = """
    header.topbar { display: none !important; }
    main { animation: none !important; }
    """

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let css = Self.appStyle.replacingOccurrences(of: "\n", with: " ")
        let script = "const s = document.createElement('style'); s.textContent = `\(css)`; document.documentElement.appendChild(s);"
        config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let view = WKWebView(frame: .zero, configuration: config)
        view.setValue(false, forKey: "drawsBackground")   // no white flash before the dark page paints
        view.allowsBackForwardNavigationGestures = true
        context.coordinator.view = view
        view.load(URLRequest(url: url))
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {
        // Load again only when the sidebar picks another page, not when the page navigates itself.
        guard context.coordinator.requested != url else { return }
        context.coordinator.requested = url
        view.load(URLRequest(url: url))
    }

    final class Coordinator {
        weak var view: WKWebView?
        var requested: URL?
        private var observer: NSObjectProtocol?

        init() {
            observer = NotificationCenter.default.addObserver(forName: .reload, object: nil, queue: .main) { [weak self] _ in
                self?.view?.reload()
            }
        }
    }
}
