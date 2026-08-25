import Foundation

enum OBDConnectionState: Equatable, Sendable {
    case idle
    case scanning
    case connecting(String)
    case initializing
    case connected(String)
    case failed(OBDError)
}

enum OBDError: Error, Equatable, Sendable {
    case bluetoothOff
    case notFound
    case timeout
    case badResponse(String)
    case unsupportedPID(UInt8)
    case disconnected
}

struct DiscoveredAdapter: Identifiable, Equatable, Sendable {
    let id: UUID
    let name: String
    let rssi: Int
}

protocol OBDTransport: AnyObject {
    var state: AsyncStream<OBDConnectionState> { get }
    var discoveredAdapters: AsyncStream<[DiscoveredAdapter]> { get }
    func startScan() async
    func stopScan()
    func connect(peripheralID: UUID) async throws
    func disconnect()
    func send(_ command: String, timeout: TimeInterval) async throws -> String
}
