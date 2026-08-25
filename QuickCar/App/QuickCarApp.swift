import SwiftUI

@main
struct QuickCarApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        // Phone window is provided by PhoneSceneDelegate via Info.plist.
        // Empty WindowGroup keeps SwiftUI App lifecycle happy without a second window.
        WindowGroup {
            EmptyView()
                .frame(width: 0, height: 0)
                .hidden()
        }
    }
}
