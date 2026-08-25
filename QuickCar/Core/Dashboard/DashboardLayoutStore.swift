import Foundation

struct DashboardLayoutStore {
    func load(from settings: AppSettings) -> DashboardLayout {
        guard let json = settings.dashboardLayoutJSON,
              let data = json.data(using: .utf8),
              let decoded = try? JSONDecoder().decode(DashboardLayout.self, from: data)
        else {
            return .factory(for: .daily)
        }
        return decoded.sanitized()
    }

    func save(_ layout: DashboardLayout, to settings: AppSettings) {
        let encoder = JSONEncoder()
        guard let data = try? encoder.encode(layout.sanitized()),
              let json = String(data: data, encoding: .utf8)
        else { return }
        settings.dashboardLayoutJSON = json
    }
}
