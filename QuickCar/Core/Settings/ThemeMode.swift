import SwiftUI

enum ThemeMode: String, CaseIterable, Codable, Sendable {
    case system
    case light
    case dark

    var displayKey: String {
        switch self {
        case .system: "theme.system"
        case .light: "theme.light"
        case .dark: "theme.dark"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}
