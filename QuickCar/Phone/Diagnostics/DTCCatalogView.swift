import SwiftUI

/// Browseable DTC meaning map — BMW-priority codes first; full OBD-II set via search.
struct DTCCatalogView: View {
    @Environment(AppSettings.self) private var settings
    @EnvironmentObject private var env: AppEnvironment
    @State private var query = ""
    @State private var all: [(code: String, summary: String, severity: String, bmw: Bool)] = []

    private var filtered: [(code: String, summary: String, severity: String, bmw: Bool)] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard !q.isEmpty else { return [] }
        return all.filter {
            $0.code.contains(q) || $0.summary.uppercased().contains(q)
        }
    }

    private var bmwRows: [(code: String, summary: String, severity: String, bmw: Bool)] {
        all.filter(\.bmw)
    }

    var body: some View {
        List {
            Section {
                Text(
                    String(
                        format: String(localized: "dtc.catalog.subtitleCount", table: "Localizable"),
                        locale: .current,
                        all.count
                    )
                )
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
            Section(String(localized: "dtc.catalog.bmwSection", table: "Localizable")) {
                ForEach(bmwRows, id: \.code) { row in
                    NavigationLink {
                        DTCDetailView(code: row.code)
                    } label: {
                        catalogRow(row)
                    }
                }
            }
            if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Section(String(localized: "dtc.catalog.otherSection", table: "Localizable")) {
                    Text(String(localized: "dtc.catalog.searchHint", table: "Localizable"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            } else {
                Section(String(localized: "dtc.catalog.results", table: "Localizable")) {
                    ForEach(filtered, id: \.code) { row in
                        NavigationLink {
                            DTCDetailView(code: row.code)
                        } label: {
                            catalogRow(row)
                        }
                    }
                }
            }
        }
        .searchable(text: $query, prompt: String(localized: "dtc.catalog.search", table: "Localizable"))
        .navigationTitle(String(localized: "dtc.catalog.title", table: "Localizable"))
        .task { loadAll() }
        .onChange(of: settings.languageCode) { loadAll() }
    }

    private func loadAll() {
        all = env.obd.dtc.allEntries(languageCode: settings.languageCode)
    }

    private func catalogRow(_ row: (code: String, summary: String, severity: String, bmw: Bool)) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(row.code)
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                if row.bmw {
                    Text("BMW")
                        .font(.caption2.weight(.bold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.brandPrimary.opacity(0.2))
                        .clipShape(Capsule())
                }
                Spacer()
                Text(row.severity)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Text(row.summary)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 2)
    }
}
