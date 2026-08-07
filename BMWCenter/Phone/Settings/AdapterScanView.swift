import SwiftUI

struct AdapterScanView: View {
    @EnvironmentObject private var obd: OBDService
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss
    @State private var connectingID: UUID?

    var body: some View {
        NavigationStack {
            List {
                if settings.useMockAdapter {
                    Section {
                        Label(String(localized: "connection.mockActive", table: "Localizable"), systemImage: "hammer.fill")
                        Button(String(localized: "connection.reconnect", table: "Localizable")) {
                            Task { await obd.reconnect() }
                        }
                    }
                }

                Section(String(localized: "settings.scanAdapters", table: "Localizable")) {
                    if obd.discoveredAdapters.isEmpty {
                        Text(String(localized: "common.loading", table: "Localizable"))
                            .foregroundStyle(.secondary)
                    }
                    ForEach(obd.discoveredAdapters) { adapter in
                        Button {
                            Task {
                                connectingID = adapter.id
                                try? await obd.connect(to: adapter.id)
                                connectingID = nil
                                dismiss()
                            }
                        } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(adapter.name)
                                    Text("RSSI \(adapter.rssi)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if connectingID == adapter.id {
                                    ProgressView()
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle(String(localized: "settings.scanAdapters", table: "Localizable"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "action.done", table: "Localizable")) { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await obd.scan() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .task {
                await obd.scan()
            }
        }
    }
}
