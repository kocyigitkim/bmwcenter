import SwiftUI
import SwiftData

struct DTCListView: View {
    @EnvironmentObject private var env: AppEnvironment
    @Environment(AppSettings.self) private var settings
    @Query(filter: #Predicate<DTCRecord> { $0.clearedAt == nil }, sort: \DTCRecord.seenAt, order: .reverse)
    private var tracked: [DTCRecord]
    @State private var codes: [DTC] = []
    @State private var errorText: String?
    @State private var confirmClear = false
    @State private var isLoading = false

    var body: some View {
        List {
            Section {
                Toggle(
                    String(localized: "settings.backgroundDTC", table: "Localizable"),
                    isOn: Binding(
                        get: { settings.backgroundDTCMonitor },
                        set: { settings.backgroundDTCMonitor = $0 }
                    )
                )
                if let last = env.dtcMonitor.lastScanAt {
                    LabeledContent(
                        String(localized: "dtc.monitor.lastScan", table: "Localizable"),
                        value: last.formatted(date: .omitted, time: .shortened)
                    )
                }
                Text(String(localized: "dtc.monitor.hint", table: "Localizable"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if let errorText {
                Text(errorText).foregroundStyle(Color("state/crit"))
            }

            Section(String(localized: "dtc.monitor.live", table: "Localizable")) {
                if isLoading {
                    HStack {
                        ProgressView()
                        Text(String(localized: "dtc.monitor.scanning", table: "Localizable"))
                            .foregroundStyle(.secondary)
                    }
                } else if codes.isEmpty {
                    Text(String(localized: "dtc.none", table: "Localizable"))
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(codes) { dtc in
                        NavigationLink {
                            DTCDetailView(code: dtc.code, status: dtc.status.rawValue)
                        } label: {
                            dtcRow(code: dtc.code, summary: dtc.summary, status: dtc.status.rawValue)
                        }
                    }
                }
            }

            if !tracked.isEmpty {
                Section(String(localized: "dtc.monitor.history", table: "Localizable")) {
                    ForEach(tracked, id: \.code) { row in
                        NavigationLink {
                            DTCDetailView(code: row.code)
                        } label: {
                            dtcRow(
                                code: row.code,
                                summary: env.obd.dtc.summary(for: row.code, languageCode: settings.languageCode),
                                status: row.statusRaw
                            )
                        }
                    }
                }
            }

            Section {
                NavigationLink(String(localized: "dtc.catalog.title", table: "Localizable")) {
                    DTCCatalogView()
                }
            }
        }
        .navigationTitle(String(localized: "dtc.stored", table: "Localizable"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(String(localized: "action.refresh", table: "Localizable")) {
                    Task { await reload() }
                }
            }
            ToolbarItem(placement: .destructiveAction) {
                Button(String(localized: "settings.clearDTC", table: "Localizable"), role: .destructive) {
                    confirmClear = true
                }
            }
        }
        .confirmationDialog(
            String(localized: "dtc.clearWarning", table: "Localizable"),
            isPresented: $confirmClear
        ) {
            Button(String(localized: "common.confirm", table: "Localizable"), role: .destructive) {
                Task {
                    try? await env.obd.clearDTCs(confirmed: true)
                    await reload()
                }
            }
        }
        .task { await reload() }
    }

    private func dtcRow(code: String, summary: String?, status: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(code).font(.system(size: 17, weight: .semibold, design: .rounded))
                Spacer()
                Text(status)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text(summary ?? String(localized: "dtc.manufacturerSpecific", table: "Localizable"))
                .font(.system(size: 13))
                .foregroundStyle(Color("text/secondary"))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        guard case .connected = env.obd.connection else {
            codes = []
            errorText = String(localized: "connection.disconnected", table: "Localizable")
            return
        }
        do {
            codes = await env.dtcMonitor.scanNow()
            if codes.isEmpty {
                codes = try await env.obd.readDTCs()
            }
            errorText = nil
        } catch {
            errorText = String(localized: "connection.disconnected", table: "Localizable")
        }
    }
}
