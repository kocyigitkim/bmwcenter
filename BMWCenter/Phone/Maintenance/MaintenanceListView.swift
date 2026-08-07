import SwiftUI
import SwiftData

struct MaintenanceListView: View {
    @EnvironmentObject private var env: AppEnvironment
    @Query private var items: [MaintenanceItem]
    @State private var showAdd = false

    var body: some View {
        List {
            ForEach(items) { item in
                VStack(alignment: .leading, spacing: 4) {
                    Text(displayTitle(item))
                        .font(.system(size: 15, weight: .semibold))
                    if let km = item.intervalKm {
                        Text("\(String(localized: "maintenance.dueIn", table: "Localizable")) \(Int(km)) km")
                            .font(.system(size: 12))
                            .foregroundStyle(Color("text/secondary"))
                    }
                    if env.settings.careShowSeverityFactor, env.settings.careAdaptiveIntervals {
                        let factor = env.care.maintenance.lastSeverity
                        Text(String(format: String(localized: "maint.severityFactor", table: "Localizable"), String(format: "%.1f", factor)))
                            .font(.system(size: 11))
                            .foregroundStyle(Color("text/secondary"))
                    }
                }
            }
        }
        .navigationTitle(String(localized: "maintenance.title", table: "Localizable"))
        .toolbar {
            Button {
                showAdd = true
            } label: {
                Image(systemName: "plus")
            }
        }
        .sheet(isPresented: $showAdd) {
            AddReminderSheet()
        }
    }

    private func displayTitle(_ item: MaintenanceItem) -> String {
        if let custom = item.customTitle, !custom.isEmpty { return custom }
        return String(localized: String.LocalizationValue(item.titleKey), table: "Localizable")
    }
}

extension MaintenanceItem: Identifiable {}
