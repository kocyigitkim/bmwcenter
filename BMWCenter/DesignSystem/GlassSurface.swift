import SwiftUI

struct GlassSurface: ViewModifier {
    enum Kind {
        case card
        case chip
        case control
        case tinted(Color)
    }

    let kind: Kind
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        if reduceTransparency {
            opaqueFallback(content)
        } else {
            glassContent(content)
        }
    }

    @ViewBuilder
    private func glassContent(_ content: Content) -> some View {
        if #available(iOS 26.0, *) {
            switch kind {
            case .card:
                content.glassEffect(.regular, in: .rect(cornerRadius: DSRadius.card))
            case .chip:
                content.glassEffect(.clear, in: .capsule)
            case .control:
                content.glassEffect(.regular.interactive(), in: .capsule)
            case .tinted(let color):
                content.glassEffect(.regular.tint(color.opacity(0.5)), in: .capsule)
            }
        } else {
            opaqueFallback(content)
        }
    }

    @ViewBuilder
    private func opaqueFallback(_ content: Content) -> some View {
        switch kind {
        case .card:
            content
                .background(Color.surface1, in: RoundedRectangle(cornerRadius: DSRadius.card, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: DSRadius.card, style: .continuous)
                        .strokeBorder(Color.hairline, lineWidth: 0.5)
                )
                .modifier(LightShadow(enabled: colorScheme == .light))
        case .chip, .control, .tinted:
            content
                .background(Color.surface1, in: Capsule())
                .overlay(Capsule().strokeBorder(Color.hairline, lineWidth: 0.5))
                .modifier(LightShadow(enabled: colorScheme == .light))
        }
    }
}

private struct LightShadow: ViewModifier {
    let enabled: Bool
    func body(content: Content) -> some View {
        if enabled {
            content.shadow(color: .black.opacity(0.06), radius: 12, y: 4)
        } else {
            content
        }
    }
}

extension View {
    func glassSurface(_ kind: GlassSurface.Kind = .card) -> some View {
        modifier(GlassSurface(kind: kind))
    }

    /// Opaque surface for charts / dense text (never glass).
    func opaqueSurface(radius: CGFloat = DSRadius.card) -> some View {
        background(
            Color.surface1,
            in: RoundedRectangle(cornerRadius: radius, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .strokeBorder(Color.hairline, lineWidth: 0.5)
        )
    }
}
