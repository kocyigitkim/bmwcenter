import SwiftUI

@main
struct WatchApp: App {
    @StateObject private var bridge = WatchConnectivityBridge()

    var body: some Scene {
        WindowGroup {
            TabView {
                WatchLiveView(bridge: bridge)
                WatchTripControlView(bridge: bridge)
            }
            .tabViewStyle(.page)
        }
    }
}
