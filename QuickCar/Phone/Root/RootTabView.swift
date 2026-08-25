import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var tripRecorder: TripRecorder
    @EnvironmentObject private var env: AppEnvironment
    @Environment(AppSettings.self) private var settings
    @State private var selection: AppTab = .dashboard

    var body: some View {
        TabView(selection: $selection) {
            Tab(
                String(localized: "tab.dashboard", table: "Localizable"),
                systemImage: AppTab.dashboard.systemImage,
                value: AppTab.dashboard
            ) {
                DashboardView()
            }

            Tab(
                String(localized: "tab.trips", table: "Localizable"),
                systemImage: AppTab.trips.systemImage,
                value: AppTab.trips
            ) {
                TripListView()
            }

            Tab(
                String(localized: "tab.fuel", table: "Localizable"),
                systemImage: AppTab.fuel.systemImage,
                value: AppTab.fuel
            ) {
                FuelView()
            }

            Tab(
                String(localized: "insights.title", table: "Localizable"),
                systemImage: AppTab.insights.systemImage,
                value: AppTab.insights
            ) {
                InsightsView()
            }

            Tab(
                String(localized: "tab.settings", table: "Localizable"),
                systemImage: AppTab.settings.systemImage,
                value: AppTab.settings
            ) {
                SettingsView()
            }
        }
        .tint(Color.brandPrimary)
        .environment(\.locale, Locale(identifier: settings.languageCode))
        .id(settings.languageCode)
        .preferredColorScheme(settings.themeMode.colorScheme)
        .modifier(TabMinimizeIfAvailable())
        .fullScreenCover(item: Binding(
            get: { env.care.fullScreenCue },
            set: { env.care.fullScreenCue = $0 }
        )) { cue in
            CareFullScreenAlertView(cue: cue) {
                env.care.fullScreenCue = nil
            }
        }
        .overlay(alignment: .bottom) {
            if tripRecorder.state.isActive {
                // Live dot near Trips tab — visual cue without badge count
                GeometryReader { _ in
                    Circle()
                        .fill(Color.semNominal)
                        .frame(width: 6, height: 6)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                        .offset(x: -UIScreen.main.bounds.width * 0.2, y: -52)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
                .ignoresSafeArea()
            }
        }
    }
}

private struct TabMinimizeIfAvailable: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.tabBarMinimizeBehavior(.onScrollDown)
        } else {
            content
        }
    }
}
