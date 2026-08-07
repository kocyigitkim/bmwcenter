import Foundation

enum AppTab: Hashable, CaseIterable {
    case dashboard
    case trips
    case fuel
    case insights
    case settings

    var titleKey: String {
        switch self {
        case .dashboard: "tab.dashboard"
        case .trips: "tab.trips"
        case .fuel: "tab.fuel"
        case .insights: "insights.title"
        case .settings: "tab.settings"
        }
    }

    var systemImage: String {
        switch self {
        case .dashboard: "gauge.with.dots.needle.bottom.50percent"
        case .trips: "road.lanes"
        case .fuel: "fuelpump.fill"
        case .insights: "chart.line.uptrend.xyaxis"
        case .settings: "gearshape.fill"
        }
    }
}
