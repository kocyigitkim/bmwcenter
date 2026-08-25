import SwiftUI

struct AccelTestView: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var countdown: Int?
    @State private var resultText = Formatters.unavailable
    @State private var running = false

    var body: some View {
        VStack(spacing: 24) {
            Text(String(localized: "accel.disclaimer", table: "Localizable"))
                .font(.system(size: 14))
                .foregroundStyle(Color("state/warn"))
                .multilineTextAlignment(.center)
                .padding()

            if let countdown {
                Text("\(countdown)")
                    .font(.system(size: 72, weight: .bold, design: .rounded).monospacedDigit())
            } else {
                Text(resultText)
                    .font(.system(size: 34, weight: .bold, design: .rounded).monospacedDigit())
            }

            Text(String(localized: "accel.accuracyNote", table: "Localizable"))
                .font(.system(size: 12))
                .foregroundStyle(Color("text/secondary"))

            if !env.care.isEngineReady {
                Text(String(localized: "ready.locked", table: "Localizable"))
                    .font(.system(size: 13))
                    .foregroundStyle(Color("text/secondary"))
                    .multilineTextAlignment(.center)
            }

            Button(String(localized: "accel.start", table: "Localizable")) {
                Task { await runTest() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(running || (env.obd.snapshot.speedKmh ?? 0) > 0 || !env.care.isEngineReady)
            Spacer()
        }
        .padding()
        .navigationTitle(String(localized: "accel.title", table: "Localizable"))
    }

    private func runTest() async {
        guard env.care.isEngineReady else { return }
        guard (env.obd.snapshot.speedKmh ?? 0) == 0 else { return }
        running = true
        for i in [3, 2, 1] {
            countdown = i
            try? await Task.sleep(nanoseconds: 1_000_000_000)
        }
        countdown = nil
        let stream = env.obd.beginHighRateSpeedSampling()
        var start: Date?
        var t0to100: Double?
        var samples = 0
        let begun = Date()
        for await (t, speed) in stream {
            samples += 1
            if start == nil, speed > 0 { start = t }
            if let start, speed >= 100 {
                t0to100 = t.timeIntervalSince(start)
                break
            }
            if Date().timeIntervalSince(begun) > 30 { break }
        }
        env.obd.endHighRateSpeedSampling()
        if let t0to100 {
            resultText = String(format: "%.2f s", t0to100)
            let record = AccelRecord(
                t0to100: t0to100,
                sampleRateHz: Double(samples) / max(t0to100, 0.1)
            )
            env.tripRepository.context.insert(record)
            env.tripRepository.save()
        } else {
            resultText = Formatters.unavailable
        }
        running = false
    }
}
