import CarPlay

final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    private var coordinator: CarPlayCoordinator?

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        Task { @MainActor in
            let env = AppEnvironment.shared
            env.start()
            let c = CarPlayCoordinator(interfaceController: interfaceController, env: env)
            self.coordinator = c
            c.start()
        }
    }

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didDisconnect interfaceController: CPInterfaceController
    ) {
        Task { @MainActor in
            self.coordinator?.stop()
            self.coordinator = nil
        }
    }
}
