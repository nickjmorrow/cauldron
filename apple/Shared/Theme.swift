import SwiftUI

/// The "Midnight sun" palette from the web app (app/globals.css, dark values): deep indigo surfaces, one warm gold accent.
enum Theme {
    static let bg = Color(red: 0.039, green: 0.051, blue: 0.136)
    static let surface = Color(red: 0.074, green: 0.089, blue: 0.189)
    static let raised = Color(red: 0.116, green: 0.135, blue: 0.250)
    static let line = Color(red: 0.180, green: 0.201, blue: 0.310)
    static let fg = Color(red: 0.906, green: 0.921, blue: 0.963)
    static let muted = Color(red: 0.630, green: 0.667, blue: 0.772)
    static let sun = Color(red: 0.989, green: 0.728, blue: 0.262)
    static let sunInk = Color(red: 0.062, green: 0.075, blue: 0.174)
    static let bad = Color(red: 1.000, green: 0.526, blue: 0.552)
}

/// The round check at the start of a row: a gold disc when done, a quiet ring when not.
struct CheckMark: View {
    var done: Bool
    var size: CGFloat = 26

    var body: some View {
        ZStack {
            Circle().strokeBorder(done ? Theme.sun : Theme.muted.opacity(0.7), lineWidth: 1.5)
            if done {
                Circle().fill(Theme.sun)
                Image(systemName: "checkmark").font(.system(size: size * 0.5, weight: .bold)).foregroundStyle(Theme.sunInk)
            }
        }
        .frame(width: size, height: size)
    }
}
