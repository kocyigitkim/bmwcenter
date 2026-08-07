import SwiftUI

/// PRD §24 Capability Scan Screen — shows what the app can currently do with
/// the connected adapter and configured vehicle platform, resolved via
/// `CapabilityResolver` (Phase 3). Read-only; no destructive actions here.
struct CapabilityScanView: View {
    @EnvironmentObject private var obd: OBDService
    @Environment(AppSettings.self) private var settings

    private var reasons: [CapabilityReason] {
        CapabilityResolver.resolveAll(
            adapterCapabilities: obd.adapterCapabilities,
            vehiclePlatform: settings.vehiclePlatform
        )
    }

    var body: some View {
        List {
            Section {
                Text(String(localized: "capability.subtitle", table: "Localizable"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Section {
                ForEach(reasons, id: \.feature) { reason in
                    row(for: reason)
                }
            }
        }
        .navigationTitle(String(localized: "capability.title", table: "Localizable"))
    }

    private func row(for reason: CapabilityReason) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(String(localized: String.LocalizationValue(featureKey(reason.feature)), table: "Localizable"))
                Spacer()
                stateBadge(reason.state)
            }
            if let detail = reason.detail {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private func stateBadge(_ state: CapabilityState) -> some View {
        let (key, color): (String, Color) = switch state {
        case .supported: ("capability.state.supported", Color("state/ok"))
        case .unsupported: ("capability.state.unsupported", Color("state/crit"))
        case .unknown: ("capability.state.unknown", Color("state/warn"))
        }
        return Text(String(localized: String.LocalizationValue(key), table: "Localizable"))
            .font(.caption.bold())
            .foregroundStyle(color)
    }

    private func featureKey(_ feature: VehicleFeature) -> String {
        "capability.feature.\(feature.rawValue)"
    }
}
