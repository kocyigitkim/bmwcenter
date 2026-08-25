import Foundation

/// A feature the app can offer, grounded in functionality that actually
/// exists today (PRD §276: never claim speculative/unimplemented OEM
/// capability). Extend this only as real features are added.
enum VehicleFeature: String, CaseIterable, Sendable {
    case liveDashboard
    case dtcRead
    case dtcClear
    case freezeFrame
    case emissionsReadiness
    /// BMW Mode-22 extended engine data (oil temp, boost, etc. — VLinkerPIDCatalog).
    case extendedEngineData
}

/// PRD §23: capabilities need more states than a boolean. This app doesn't
/// yet have transport/security-gated features, so only the states that are
/// actually reachable today are modeled; more are added as those features
/// (e.g. BMW service actions) are built.
enum CapabilityState: Sendable, Equatable {
    case supported
    case unsupported
    /// Not yet known — e.g. adapter capabilities haven't been probed this session.
    case unknown
}

/// A resolved capability plus a human-readable reason (PRD §22 example:
/// "Supported by vehicle / Unavailable with current adapter").
struct CapabilityReason: Sendable, Equatable {
    let feature: VehicleFeature
    let state: CapabilityState
    let detail: String?
}

/// Resolves feature availability from what has actually been observed this
/// session (PRD §22: vehicle ∩ adapter ∩ ... — never `if vehicle.brand == .bmw`
/// scattered through the UI). This is intentionally a pure function over
/// already-collected state (`AdapterCapabilities`, `VehiclePlatform`), not a
/// service with its own I/O.
enum CapabilityResolver {
    static func resolve(
        feature: VehicleFeature,
        adapterCapabilities: AdapterCapabilities,
        vehiclePlatform: VehiclePlatform
    ) -> CapabilityReason {
        switch feature {
        case .liveDashboard, .dtcRead, .dtcClear, .freezeFrame, .emissionsReadiness:
            // These use only generic Mode 01/02/03/04 — available as soon as the
            // adapter has answered a supported-PID bitmask query at all.
            if adapterCapabilities.contains(.genericOBD) {
                return CapabilityReason(feature: feature, state: .supported, detail: nil)
            }
            return CapabilityReason(
                feature: feature, state: .unknown,
                detail: "No supported-PID data yet for this session"
            )

        case .extendedEngineData:
            guard vehiclePlatform != .universal else {
                return CapabilityReason(
                    feature: feature, state: .unsupported,
                    detail: "Extended Mode 22 PIDs are only available on BMW profiles with a Mode 22 pack"
                )
            }
            if adapterCapabilities.contains(.genericOBD) {
                return CapabilityReason(feature: feature, state: .supported, detail: nil)
            }
            return CapabilityReason(
                feature: feature, state: .unknown,
                detail: "No supported-PID data yet for this session"
            )
        }
    }

    /// Convenience: resolve every known feature at once (e.g. for a future
    /// capability-scan screen, PRD §24).
    static func resolveAll(
        adapterCapabilities: AdapterCapabilities,
        vehiclePlatform: VehiclePlatform
    ) -> [CapabilityReason] {
        VehicleFeature.allCases.map {
            resolve(feature: $0, adapterCapabilities: adapterCapabilities, vehiclePlatform: vehiclePlatform)
        }
    }
}
