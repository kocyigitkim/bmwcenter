import CarPlay

@MainActor
final class AlertPresenter {
    private weak var interfaceController: CPInterfaceController?
    private var lastAlertKey: String?

    init(interfaceController: CPInterfaceController) {
        self.interfaceController = interfaceController
    }

    func presentBluetoothOff() {
        present(
            key: "bt",
            title: String(localized: "alert.bluetoothOff.title", table: "Localizable"),
            message: String(localized: "alert.bluetoothOff.body", table: "Localizable")
        )
    }

    func presentDisconnected() {
        present(
            key: "disc",
            title: String(localized: "alert.disconnected.title", table: "Localizable"),
            message: String(localized: "alert.disconnected.body", table: "Localizable")
        )
    }

    private func present(key: String, title: String, message: String) {
        guard lastAlertKey != key else { return }
        lastAlertKey = key
        let ok = CPAlertAction(title: String(localized: "action.ok", table: "Localizable"), style: .default) { [weak self] _ in
            self?.lastAlertKey = nil
        }
        let alert = CPAlertTemplate(titleVariants: [title], actions: [ok])
        // CPAlertTemplate doesn't take message in all SDKs — put body in title if needed
        _ = message
        interfaceController?.presentTemplate(alert, animated: true, completion: nil)
    }

    func reset() {
        lastAlertKey = nil
    }
}
