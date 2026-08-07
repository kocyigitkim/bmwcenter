import Foundation

enum SeverityRouter {
    static func plan(for severity: CueSeverity, appInBackground: Bool = false) -> CareChannelPlan {
        switch severity {
        case .critical:
            return CareChannelPlan(
                speak: true,
                carPlayRow: true,
                carPlayAlert: true,
                phoneChip: true,
                fullScreen: true,
                notification: true,
                haptic: "error",
                toneCount: 2
            )
        case .protective:
            return CareChannelPlan(
                speak: true,
                carPlayRow: true,
                carPlayAlert: false,
                phoneChip: true,
                fullScreen: false,
                notification: appInBackground,
                haptic: "warning",
                toneCount: 1
            )
        case .coach:
            return CareChannelPlan(
                speak: true,
                carPlayRow: true,
                carPlayAlert: false,
                phoneChip: true,
                fullScreen: false,
                notification: false,
                haptic: nil,
                toneCount: 0
            )
        case .celebration:
            return CareChannelPlan(
                speak: true,
                carPlayRow: true,
                carPlayAlert: false,
                phoneChip: true,
                fullScreen: false,
                notification: false,
                haptic: "success",
                toneCount: 1
            )
        }
    }

    static func alertSeverity(from cue: CueSeverity) -> AlertSeverity {
        switch cue {
        case .critical: return .critical
        case .protective: return .warning
        case .coach, .celebration: return .info
        }
    }
}
