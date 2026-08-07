import SwiftUI

enum DSFont {
    static func display(_ size: CGFloat = 48) -> Font {
        .system(size: size, weight: .bold, design: .rounded)
    }

    static func metricXL(_ size: CGFloat = 34) -> Font {
        .system(size: size, weight: .bold, design: .rounded)
    }

    static func metricL(_ size: CGFloat = 26) -> Font {
        .system(size: size, weight: .semibold, design: .rounded)
    }

    static func unit(_ size: CGFloat = 13) -> Font {
        .system(size: size, weight: .medium, design: .default)
    }

    static func title(_ size: CGFloat = 17) -> Font {
        .system(size: size, weight: .semibold, design: .default)
    }

    static func label(_ size: CGFloat = 13) -> Font {
        .system(size: size, weight: .medium, design: .default)
    }

    static func caption(_ size: CGFloat = 11) -> Font {
        .system(size: size, weight: .regular, design: .default)
    }

    static func mono(_ size: CGFloat = 13) -> Font {
        .system(size: size, weight: .regular, design: .monospaced)
    }
}

extension View {
    func dsMetricDigit() -> some View {
        monospacedDigit()
    }

    func dsDynamicTypeClamp() -> some View {
        dynamicTypeSize(...DynamicTypeSize.accessibility2)
    }
}
