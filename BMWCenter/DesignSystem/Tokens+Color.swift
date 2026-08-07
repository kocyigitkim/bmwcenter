import SwiftUI
import UIKit

enum SemanticColor: String, Sendable, CaseIterable {
    case nominal
    case attention
    case critical
    case cold
    case inactive
    case info

    var color: Color {
        switch self {
        case .nominal: .semNominal
        case .attention: .semAttention
        case .critical: .semCritical
        case .cold: .semCold
        case .inactive: .semInactive
        case .info: .semInfo
        }
    }

    var uiColor: UIColor {
        switch self {
        case .nominal: UIColor(Color.semNominal)
        case .attention: UIColor(Color.semAttention)
        case .critical: UIColor(Color.semCritical)
        case .cold: UIColor(Color.semCold)
        case .inactive: UIColor(Color.semInactive)
        case .info: UIColor(Color.semInfo)
        }
    }
}

extension Color {
    // MARK: Canvas / Surface
    static let canvas = Color(light: 0xF2F4F7, dark: 0x07090C)
    static let canvasElevated = Color(light: 0xFFFFFF, dark: 0x0D1116)
    static let surface1 = Color(light: 0xFFFFFF, dark: 0x12171E)
    static let surface2 = Color(light: 0xEEF1F5, dark: 0x1A212A)
    static let surface3 = Color(light: 0xE2E7ED, dark: 0x232C37)
    static let hairline = Color(light: 0xD7DDE5, dark: 0x2B3541)

    // MARK: Content
    static let contentPrimary = Color(light: 0x0B0F14, dark: 0xF4F7FA)
    static let contentSecondary = Color(light: 0x5A6473, dark: 0x9BA6B4)
    static let contentTertiary = Color(light: 0x8A929E, dark: 0x66707E)

    // MARK: Semantic
    static let semNominal = Color(light: 0x1E9E58, dark: 0x2FD07B)
    static let semAttention = Color(light: 0xC4822A, dark: 0xF2B23E)
    static let semCritical = Color(light: 0xD22C2E, dark: 0xFF4D4F)
    static let semCold = Color(light: 0x2A76BE, dark: 0x4FA8F5)
    static let semInactive = Color(light: 0xA7AEB8, dark: 0x4A5462)
    static let semInfo = Color(light: 0x5849C7, dark: 0x7C6CF5)

    // MARK: Brand
    static let brandPrimary = Color(hex: 0x1C6FE0)
    static let brandSecondary = Color(hex: 0x6E4A9E)

    static var brandGradient: LinearGradient {
        LinearGradient(
            colors: [.brandPrimary, .brandSecondary],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    init(hex: UInt32, opacity: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }

    init(light: UInt32, dark: UInt32) {
        self.init(uiColor: UIColor { traits in
            let hex = traits.userInterfaceStyle == .dark ? dark : light
            let r = CGFloat((hex >> 16) & 0xFF) / 255
            let g = CGFloat((hex >> 8) & 0xFF) / 255
            let b = CGFloat(hex & 0xFF) / 255
            return UIColor(red: r, green: g, blue: b, alpha: 1)
        })
    }
}
