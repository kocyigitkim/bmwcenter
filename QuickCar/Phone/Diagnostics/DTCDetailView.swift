import SwiftUI

/// Detail page for a single DTC — meaning, system/severity badges, and general
/// system+severity-based guidance (PRD-aligned: no code-specific repair steps,
/// since those can't be safely verified at this scale).
struct DTCDetailView: View {
    @EnvironmentObject private var env: AppEnvironment
    @Environment(AppSettings.self) private var settings
    let code: String
    /// Live DTC status (stored/pending/permanent) when opened from the live-codes
    /// list — nil for catalog browsing or historical (cleared) entries.
    var status: String?

    private var entry: DTCService.DTCCatalogEntry? {
        env.obd.dtc.entry(for: code)
    }

    private var summary: String {
        entry?.summary(languageCode: settings.languageCode)
            ?? String(localized: "dtc.manufacturerSpecific", table: "Localizable")
    }

    private var severity: String { entry?.severity ?? "medium" }

    private var severityColor: Color {
        switch severity {
        case "high": Color("state/crit")
        case "low": Color("state/ok")
        default: Color("state/warn")
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DSSpace.cardGap) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(code)
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                    HStack(spacing: 8) {
                        if let status {
                            badge(status, color: .secondary)
                        }
                        badge(severity, color: severityColor)
                        if let systemKey = entry?.systemKey {
                            badge(String(localized: String.LocalizationValue(systemKey), table: "Localizable"), color: .secondary)
                        }
                    }
                }

                Text(summary)
                    .font(.body)
                    .foregroundStyle(Color("text/secondary"))

                SectionCard {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(String(localized: "dtc.guidance.title", table: "Localizable"))
                            .font(.headline)
                        Text(DTCGuidance.text(system: entry?.system, severity: entry?.severity))
                            .font(.subheadline)
                            .foregroundStyle(Color("text/secondary"))
                    }
                }

                if status != nil {
                    NavigationLink {
                        FreezeFrameView(code: code)
                    } label: {
                        HStack {
                            Text(String(localized: "freezeFrame.title", table: "Localizable"))
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding()
                        .background(Color("bg/surface"))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(DSSpace.screenEdge)
        }
        .background(Color.canvas.ignoresSafeArea())
        .navigationTitle(code)
    }

    private func badge(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .foregroundStyle(color)
            .background(color.opacity(0.15))
            .clipShape(Capsule())
    }
}
