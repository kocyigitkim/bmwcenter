import Foundation

/// Single-queue spoken cue scheduler with priority and fatigue rules.
@MainActor
final class CueScheduler {
    struct Config: Sendable {
        var coachMinIntervalS: TimeInterval = 25
        var sameCueMinIntervalS: TimeInterval = 120
        var coachHourlyCap: Int = 12
        var ignoreMuteHours: TimeInterval = 24 * 3600
        var ignoreThreshold: Int = 3
        var maxWords: Int = 8
        var frequencyMultiplier: Double = 1.0
    }

    private let announcer: AudioAnnouncer
    private var config: Config
    private var queue: [CareCue] = []
    private var lastAnyCoachAt: Date = .distantPast
    private var lastCueAt: [String: Date] = [:]
    private var coachTimestamps: [Date] = []
    private var ignoreCounts: [String: Int] = [:]
    private var mutedUntil: [String: Date] = [:]
    private var isSpeaking = false
    private var speakTask: Task<Void, Never>?
    private var coachWarningCount = 0
    private var positiveCount = 0

    var onPresented: ((CareCue, CareChannelPlan) -> Void)?

    init(announcer: AudioAnnouncer, config: Config = Config()) {
        self.announcer = announcer
        self.config = config
    }

    func updateFrequency(_ multiplier: Double) {
        config.frequencyMultiplier = max(0.5, min(2.0, multiplier))
    }

    func enqueue(_ cue: CareCue, now: Date = .now, appInBackground: Bool = false) {
        guard wordCount(cue.text) <= config.maxWords else { return }
        if let until = mutedUntil[cue.id], until > now { return }

        if cue.severity == .coach {
            let minCoach = config.coachMinIntervalS * config.frequencyMultiplier
            if now.timeIntervalSince(lastAnyCoachAt) < minCoach { return }
            coachTimestamps = coachTimestamps.filter { now.timeIntervalSince($0) < 3600 }
            if coachTimestamps.count >= config.coachHourlyCap { return }
            // Balance: every 5 warnings need ≥1 positive
            if coachWarningCount >= 5 * max(1, positiveCount + 1) {
                return
            }
        }

        if cue.severity != .critical {
            if let last = lastCueAt[cue.id],
               now.timeIntervalSince(last) < config.sameCueMinIntervalS {
                return
            }
        }

        if let idx = queue.firstIndex(where: { $0.id == cue.id }) {
            if cue.severity > queue[idx].severity {
                queue[idx] = cue
            }
            return
        }
        queue.append(cue)
        queue.sort { $0.severity > $1.severity }
        drain(now: now, appInBackground: appInBackground)
    }

    func enqueueAll(_ cues: [CareCue], now: Date = .now, appInBackground: Bool = false) {
        for cue in cues {
            enqueue(cue, now: now, appInBackground: appInBackground)
        }
    }

    func markIgnored(cueID: String, now: Date = .now) {
        let n = (ignoreCounts[cueID] ?? 0) + 1
        ignoreCounts[cueID] = n
        if n >= config.ignoreThreshold {
            mutedUntil[cueID] = now.addingTimeInterval(config.ignoreMuteHours)
            ignoreCounts[cueID] = 0
        }
    }

    func resetFatigue() {
        ignoreCounts.removeAll()
        mutedUntil.removeAll()
        coachWarningCount = 0
        positiveCount = 0
    }

    /// Test helper: returns whether a cue would be accepted without speaking.
    func wouldAccept(_ cue: CareCue, now: Date = .now) -> Bool {
        if let until = mutedUntil[cue.id], until > now { return false }
        if cue.severity == .coach {
            let minCoach = config.coachMinIntervalS * config.frequencyMultiplier
            if now.timeIntervalSince(lastAnyCoachAt) < minCoach { return false }
            let recent = coachTimestamps.filter { now.timeIntervalSince($0) < 3600 }
            if recent.count >= config.coachHourlyCap { return false }
        }
        if cue.severity != .critical {
            if let last = lastCueAt[cue.id],
               now.timeIntervalSince(last) < config.sameCueMinIntervalS {
                return false
            }
        }
        return wordCount(cue.text) <= config.maxWords
    }

    /// Test helper: simulate acceptance bookkeeping without AVAudio.
    func recordAccepted(_ cue: CareCue, now: Date = .now) {
        lastCueAt[cue.id] = now
        if cue.severity == .coach {
            lastAnyCoachAt = now
            coachTimestamps.append(now)
            coachWarningCount += 1
        }
        if cue.severity == .celebration {
            positiveCount += 1
            coachWarningCount = 0
        }
    }

    private func drain(now: Date, appInBackground: Bool) {
        guard !isSpeaking, let cue = queue.first else { return }
        queue.removeFirst()
        isSpeaking = true
        lastCueAt[cue.id] = now
        if cue.severity == .coach {
            lastAnyCoachAt = now
            coachTimestamps.append(now)
            coachWarningCount += 1
        }
        if cue.severity == .celebration {
            positiveCount += 1
            coachWarningCount = 0
        }
        let plan = SeverityRouter.plan(for: cue.severity, appInBackground: appInBackground)
        onPresented?(cue, plan)
        if plan.speak {
            announcer.announceCare(cue.text, severity: cue.severity, toneCount: plan.toneCount)
        }
        speakTask?.cancel()
        speakTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            await MainActor.run {
                self?.isSpeaking = false
                self?.drain(now: Date(), appInBackground: appInBackground)
            }
        }
    }

    private func wordCount(_ text: String) -> Int {
        text.split { $0.isWhitespace || $0.isNewline }.count
    }
}
