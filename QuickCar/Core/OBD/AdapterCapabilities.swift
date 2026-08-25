import Foundation

/// Coarse feature groups a session has actually demonstrated support for,
/// derived only from data observed on the wire (PRD §13 Adapter Layer /
/// §22 Capability Engine principle: never infer capability from adapter or
/// vehicle name alone). This is a building block for the future
/// CapabilityResolver (PRD §243 Phase 3) — it does not itself gate any
/// feature yet.
struct AdapterCapabilities: OptionSet, Sendable, Equatable {
    let rawValue: UInt64

    /// Adapter answered a Mode 01 supported-PID bitmask query (0100/0120/0140) at all.
    static let genericOBD = AdapterCapabilities(rawValue: 1 << 0)
    /// Core live-data PIDs (RPM, vehicle speed) are in the supported bitmask.
    static let liveData = AdapterCapabilities(rawValue: 1 << 1)
    /// Fuel-system PIDs (fuel trims, engine load) are supported.
    static let fuelSystem = AdapterCapabilities(rawValue: 1 << 2)
    /// Intake/airflow PIDs (MAF, MAP, intake air temp) are supported.
    static let airflow = AdapterCapabilities(rawValue: 1 << 3)
    /// Module voltage PID is supported.
    static let electrical = AdapterCapabilities(rawValue: 1 << 4)

    /// Derives capabilities purely from a supported-PID bitmask — the same
    /// data `OBDService` already collects via `OBDPIDCatalog.parseSupportedBitmask`
    /// at session start. An empty input means "unknown," not "unsupported."
    static func detect(supportedPIDs: Set<UInt8>) -> AdapterCapabilities {
        guard !supportedPIDs.isEmpty else { return [] }
        var caps: AdapterCapabilities = [.genericOBD]
        if supportedPIDs.isSuperset(of: [0x0C, 0x0D]) {
            caps.insert(.liveData)
        }
        if supportedPIDs.contains(0x04) || supportedPIDs.contains(0x06) || supportedPIDs.contains(0x07) {
            caps.insert(.fuelSystem)
        }
        if supportedPIDs.contains(0x10) || supportedPIDs.contains(0x0B) || supportedPIDs.contains(0x0F) {
            caps.insert(.airflow)
        }
        if supportedPIDs.contains(0x42) {
            caps.insert(.electrical)
        }
        return caps
    }
}
