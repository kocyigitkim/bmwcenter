import Foundation

/// Overall classification for a "Scan Vehicle" pass (PRD §30/§31). Deliberately
/// simple in this first version — combines DTC presence and MIL/readiness state
/// only. Extend as freeze frame / Mode 6 / battery / sensor-plausibility inputs
/// are added (see PRD §30 for the full generic scan flow this will grow into).
enum VehicleScanOverallStatus: String, Sendable, Equatable {
    case good
    case attention
    case critical
}

/// A single "Scan Vehicle" result (PRD §31 Scan Result). Combines what was
/// actually read this scan — never a cached/stale value presented as fresh.
struct VehicleScanResult: Sendable, Equatable {
    let performedAt: Date
    let dtcs: [DTC]
    let readiness: ReadinessStatus?
    let overallStatus: VehicleScanOverallStatus

    var storedCount: Int { dtcs.filter { $0.status == .stored }.count }
    var pendingCount: Int { dtcs.filter { $0.status == .pending }.count }
    var permanentCount: Int { dtcs.filter { $0.status == .permanent }.count }
}

/// Pure classification logic, kept separate from the I/O in `OBDService.performScan()`
/// so it's directly unit-testable without a transport/session.
enum VehicleScanClassifier {
    static func classify(dtcs: [DTC], readiness: ReadinessStatus?) -> VehicleScanOverallStatus {
        if readiness?.milOn == true { return .critical }
        if dtcs.contains(where: { $0.status == .permanent }) { return .critical }
        if !dtcs.isEmpty { return .attention }
        return .good
    }
}
