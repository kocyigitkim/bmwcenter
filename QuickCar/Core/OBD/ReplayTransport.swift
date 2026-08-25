import Foundation

/// A single recorded request/response exchange (PRD §151 diagnostic fixture format).
struct ReplayFrame: Codable, Equatable, Sendable {
    let request: String
    let response: String
}

/// A named, recorded diagnostic session used to deterministically reproduce a
/// real vehicle's request/response traffic for protocol debugging and tests
/// (PRD §150 Replay Transport / §151 Diagnostic Fixture Format).
struct ReplayFixture: Codable, Equatable, Sendable {
    let name: String
    let frames: [ReplayFrame]
}

/// Replays a recorded `ReplayFixture` instead of talking to real hardware.
///
/// Responses are matched by exact (normalized) command text. If the same
/// command appears multiple times in the fixture — e.g. a PID sampled
/// repeatedly across a drive — successive `send` calls for that command
/// consume the recorded responses in order, then keep returning the last one
/// once exhausted, so a fixture with a single time-varying trace still
/// answers indefinitely for a polling loop.
final class ReplayTransport: OBDTransport, @unchecked Sendable {
    private let stateContinuation: AsyncStream<OBDConnectionState>.Continuation
    private let adaptersContinuation: AsyncStream<[DiscoveredAdapter]>.Continuation
    let state: AsyncStream<OBDConnectionState>
    let discoveredAdapters: AsyncStream<[DiscoveredAdapter]>

    private let replayID = UUID(uuidString: "00000000-0000-4000-8000-000000000002")!
    private let fixture: ReplayFixture
    private let lock = NSLock()
    private var connected = false
    /// normalized command -> remaining recorded responses for that command.
    private var responsesByCommand: [String: [String]]

    init(fixture: ReplayFixture) {
        self.fixture = fixture
        var stateCont: AsyncStream<OBDConnectionState>.Continuation!
        state = AsyncStream { stateCont = $0 }
        stateContinuation = stateCont

        var adaptersCont: AsyncStream<[DiscoveredAdapter]>.Continuation!
        discoveredAdapters = AsyncStream { adaptersCont = $0 }
        adaptersContinuation = adaptersCont

        var byCommand: [String: [String]] = [:]
        for frame in fixture.frames {
            byCommand[Self.normalize(frame.request), default: []].append(frame.response)
        }
        responsesByCommand = byCommand

        stateContinuation.yield(.idle)
    }

    func startScan() async {
        stateContinuation.yield(.scanning)
        let adapter = DiscoveredAdapter(id: replayID, name: "Replay: \(fixture.name)", rssi: -30)
        adaptersContinuation.yield([adapter])
        stateContinuation.yield(.idle)
    }

    func stopScan() {}

    func connect(peripheralID: UUID) async throws {
        guard peripheralID == replayID else { throw OBDError.notFound }
        stateContinuation.yield(.connecting(fixture.name))
        stateContinuation.yield(.initializing)
        lock.lock()
        connected = true
        lock.unlock()
        stateContinuation.yield(.connected(fixture.name))
    }

    func disconnect() {
        lock.lock()
        connected = false
        lock.unlock()
        stateContinuation.yield(.idle)
    }

    func send(_ command: String, timeout: TimeInterval) async throws -> String {
        lock.lock()
        defer { lock.unlock() }
        guard connected else { throw OBDError.disconnected }

        let key = Self.normalize(command)
        guard var queue = responsesByCommand[key], !queue.isEmpty else {
            // AT commands not explicitly recorded are assumed accepted, matching
            // real ELM327 behavior for benign configuration commands the fixture
            // author didn't bother capturing.
            if key.hasPrefix("AT") { return "OK" }
            return "NO DATA"
        }
        let response = queue.count > 1 ? queue.removeFirst() : queue[0]
        responsesByCommand[key] = queue
        return response
    }

    private static func normalize(_ command: String) -> String {
        command.uppercased().trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
