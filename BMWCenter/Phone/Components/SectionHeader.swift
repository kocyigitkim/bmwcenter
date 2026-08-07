import SwiftUI

struct SectionHeader: View {
    let title: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: DSSpace.s2) {
            Text(title)
                .font(DSFont.label())
                .foregroundStyle(Color.contentSecondary)
                .textCase(.uppercase)
                .tracking(0.6)
            Spacer(minLength: 0)
            if let actionTitle, let action {
                Button(action: action) {
                    HStack(spacing: 2) {
                        Text(actionTitle)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11, weight: .semibold))
                    }
                    .font(DSFont.label())
                    .foregroundStyle(Color.brandPrimary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, DSSpace.screenEdge)
        .padding(.top, DSSpace.s3)
        .padding(.bottom, DSSpace.s1)
        .accessibilityAddTraits(.isHeader)
    }
}
