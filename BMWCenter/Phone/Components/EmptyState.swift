import SwiftUI

struct EmptyState: View {
    let title: String
    let message: String
    var systemImage: String = "tray"
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: DSSpace.s3) {
            Image(systemName: systemImage)
                .font(.system(size: 44))
                .foregroundStyle(Color.contentTertiary)
            Text(title)
                .font(DSFont.title())
                .foregroundStyle(Color.contentPrimary)
                .multilineTextAlignment(.center)
            Text(message)
                .font(DSFont.caption())
                .foregroundStyle(Color.contentSecondary)
                .multilineTextAlignment(.center)
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .font(DSFont.label())
                    .padding(.horizontal, DSSpace.s4)
                    .padding(.vertical, DSSpace.s2)
                    .glassSurface(.control)
            }
        }
        .padding(DSSpace.s7)
        .frame(maxWidth: .infinity)
        .dsDynamicTypeClamp()
    }
}

/// Compatibility wrapper for existing call sites.
struct EmptyStateView: View {
    let titleKey: String
    let subtitleKey: String
    let systemImage: String

    var body: some View {
        EmptyState(
            title: String(localized: String.LocalizationValue(titleKey), table: "Localizable"),
            message: String(localized: String.LocalizationValue(subtitleKey), table: "Localizable"),
            systemImage: systemImage
        )
    }
}
