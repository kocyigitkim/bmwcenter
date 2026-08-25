import AppIntents

struct QuickCarShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartTripIntent(),
            phrases: ["Start a trip in \(.applicationName)"],
            shortTitle: "Start trip",
            systemImageName: "play.circle.fill"
        )
        AppShortcut(
            intent: StopTripIntent(),
            phrases: ["Stop trip in \(.applicationName)"],
            shortTitle: "Stop trip",
            systemImageName: "stop.circle.fill"
        )
        AppShortcut(
            intent: FuelLevelIntent(),
            phrases: ["Fuel level in \(.applicationName)"],
            shortTitle: "Fuel level",
            systemImageName: "fuelpump.fill"
        )
        AppShortcut(
            intent: LastTripIntent(),
            phrases: ["Last trip in \(.applicationName)"],
            shortTitle: "Last trip",
            systemImageName: "road.lanes"
        )
    }
}
