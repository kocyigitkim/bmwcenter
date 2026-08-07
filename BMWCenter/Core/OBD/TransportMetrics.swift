import Foundation

/// Connection-quality snapshot for a transport session (PRD §118/§156: adapter
/// benchmark / connection metrics). Read-only telemetry — never used to change
/// transport behavior on its own.
struct TransportMetrics: Equatable, Sendable {
    var commandCount: Int = 0
    var timeoutCount: Int = 0
    var averageLatencyMs: Double = 0
    var lastLatencyMs: Double?

    var timeoutRate: Double {
        commandCount == 0 ? 0 : Double(timeoutCount) / Double(commandCount)
    }
}

/// Accumulates per-command latency/timeout stats for a transport. Pure bookkeeping,
/// independent of any specific transport implementation or hardware.
actor TransportMetricsRecorder {
    private(set) var metrics = TransportMetrics()
    private var latencySum: Double = 0

    func recordSuccess(latencyMs: Double) {
        metrics.commandCount += 1
        latencySum += latencyMs
        metrics.averageLatencyMs = latencySum / Double(metrics.commandCount)
        metrics.lastLatencyMs = latencyMs
    }

    func recordTimeout() {
        metrics.commandCount += 1
        metrics.timeoutCount += 1
    }

    func reset() {
        metrics = TransportMetrics()
        latencySum = 0
    }
}
