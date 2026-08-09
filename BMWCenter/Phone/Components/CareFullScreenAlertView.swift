import SwiftUI

/// Full-screen interruption for a critical/protective safety cue (currently:
/// engine overheat critical, and coolant/overheat protective warnings) — a
/// phone chip alone is easy to miss while driving.
struct CareFullScreenAlertView: View {
    let cue: CareCue
    let onDismiss: () -> Void

    private var isCritical: Bool { cue.severity == .critical }

    var body: some View {
        VStack(spacing: DSSpace.s5) {
            Spacer()
            Image(systemName: isCritical ? "exclamationmark.octagon.fill" : "thermometer.high")
                .font(.system(size: 56))
                .foregroundStyle(isCritical ? Color.semCritical : Color.semAttention)

            Text(cue.text)
                .font(DSFont.title())
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.contentPrimary)
                .padding(.horizontal, DSSpace.s5)

            Spacer()

            Button(String(localized: "action.ok", table: "Localizable")) {
                onDismiss()
            }
            .font(DSFont.title())
            .frame(maxWidth: .infinity)
            .padding(DSSpace.s3)
            .background(isCritical ? Color.semCritical : Color.semAttention)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, DSSpace.s5)
            .padding(.bottom, DSSpace.s6)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.canvas.ignoresSafeArea())
    }
}
