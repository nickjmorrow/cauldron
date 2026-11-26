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
        // The whole box takes the click. Without this only the drawn outline does: on the Mac a click in the middle
        // of an unchecked box did nothing.
        .contentShape(Rectangle())
    }
}

/// "for Stuffing": the meals or other reasons an item is bought for, as a small brass tag.
struct MealTag: View {
    var meals: [String]

    var body: some View {
        Text(meals.joined(separator: ", "))
            .font(.caption.weight(.medium))
            .lineLimit(1)
            .foregroundStyle(Theme.sun)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Theme.sun.opacity(0.12), in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.sun.opacity(0.35), lineWidth: 1))
            .accessibilityLabel("For " + meals.joined(separator: ", "))
    }
}

/// The small "looking up its aisle" note shown while the server asks Claude.
struct LookingNote: View {
    var body: some View {
        HStack(spacing: 6) { ProgressView().controlSize(.mini); Text("Finding its aisle…") }
            .font(.caption).foregroundStyle(Theme.muted)
    }
}
