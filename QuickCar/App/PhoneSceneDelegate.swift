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
        self.window = window
        window.makeKeyAndVisible()
        handleURLs(connectionOptions.urlContexts.map(\.url))
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        handleURLs(URLContexts.map(\.url))
    }

    private func handleURLs(_ urls: [URL]) {
        for url in urls {
            guard url.scheme == "quickcar", url.host == "stop-trip" else { continue }
            AppEnvironment.shared.tripRecorder.manualStop()
        }
    }
}
