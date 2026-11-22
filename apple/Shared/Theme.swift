import SwiftUI

/// Cauldron's palette from the web app (app/globals.css, dark values), taken from the app icon's fire plate:
/// an oxblood ground, cream text, brass as the one accent (named `sun` from the first palette).
enum Theme {
    static let bg = Color(red: 0.097, green: 0.036, blue: 0.036)
    static let surface = Color(red: 0.142, green: 0.066, blue: 0.065)
    static let raised = Color(red: 0.195, green: 0.102, blue: 0.098)
    static let line = Color(red: 0.273, green: 0.175, blue: 0.161)
    static let fg = Color(red: 0.938, green: 0.899, blue: 0.822)
    static let muted = Color(red: 0.74, green: 0.669, blue: 0.59)
    static let sun = Color(red: 0.851, green: 0.694, blue: 0.398)
    static let sunInk = Color(red: 0.147, green: 0.054, blue: 0.056)
    static let bad = Color(red: 0.964, green: 0.514, blue: 0.557)
}

/// The checkbox at the start of a row: a filled brass box with a tick when done, a quiet outlined box when not.
struct CheckMark: View {
    var done: Bool
    var size: CGFloat = 26

    private var box: RoundedRectangle { RoundedRectangle(cornerRadius: size * 0.24, style: .continuous) }

    var body: some View {
        ZStack {
            box.strokeBorder(done ? Theme.sun : Theme.muted.opacity(0.7), lineWidth: 1.5)
            if done {
                box.fill(Theme.sun)
                Image(systemName: "checkmark").font(.system(size: size * 0.5, weight: .bold)).foregroundStyle(Theme.sunInk)
            }
        }
        .frame(width: size, height: size)
    }
}
