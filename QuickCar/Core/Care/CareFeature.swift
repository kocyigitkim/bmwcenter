import Foundation

protocol CareFeature: AnyObject {
    var id: String { get }
    var requiredPIDs: Set<UInt8> { get }
    var optionalPIDs: Set<UInt8> { get }
    func isEnabled(settings: AppSettings) -> Bool
    func isAvailable(supportedPIDs: Set<UInt8>) -> Bool
    func unavailableReason(supportedPIDs: Set<UInt8>) -> String?
    func evaluate(snapshot: VehicleSnapshot, context: inout CareContext) -> [CareCue]
    func onTripEnded(trip: Trip, context: CareContext) -> [CareCue]
}

extension CareFeature {
    func isAvailable(supportedPIDs: Set<UInt8>) -> Bool {
        requiredPIDs.isSubset(of: supportedPIDs) || supportedPIDs.isEmpty
    }

    func unavailableReason(supportedPIDs: Set<UInt8>) -> String? {
        guard !isAvailable(supportedPIDs: supportedPIDs) else { return nil }
        let missing = requiredPIDs.subtracting(supportedPIDs).sorted()
        let names = missing.map { String(format: "0x%02X", $0) }.joined(separator: ", ")
        return LocalizedCare.string("protect.notSupported", names)
    }

    func onTripEnded(trip: Trip, context: CareContext) -> [CareCue] { [] }
}
