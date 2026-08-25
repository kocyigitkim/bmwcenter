import Foundation

actor Throttle {
    private let interval: TimeInterval
    private var lastFire: Date = .distantPast
    private var pendingTask: Task<Void, Never>?

    init(interval: TimeInterval) {
        self.interval = interval
    }

    func fire(action: @escaping @Sendable () async -> Void) {
        let now = Date()
        let elapsed = now.timeIntervalSince(lastFire)
        if elapsed >= interval {
            lastFire = now
            pendingTask?.cancel()
            pendingTask = Task { await action() }
            return
        }
        let delay = interval - elapsed
        pendingTask?.cancel()
        pendingTask = Task {
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            lastFire = Date()
            await action()
        }
    }

    func cancel() {
        pendingTask?.cancel()
        pendingTask = nil
    }
}
