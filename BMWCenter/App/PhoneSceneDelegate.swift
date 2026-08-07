import UIKit
import SwiftUI

final class PhoneSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let env = AppEnvironment.shared
        env.start()

        let root = RootTabView()
            .environment(env.settings)
            .environmentObject(env)
            .environmentObject(env.obd)
            .environmentObject(env.tripRecorder)
            .modelContainer(env.container)

        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = UIHostingController(rootView: root)
        window.overrideUserInterfaceStyle = .dark
        self.window = window
        window.makeKeyAndVisible()
    }
}
