import Foundation

/// Stub CloudKit sync that respects the iCloud sync toggle.
@MainActor
final class CloudSyncController: ObservableObject {
    @Published private(set) var lastSyncedAt: Date?
    @Published private(set) var isSyncing = false

    private let settings: AppSettings

    init(settings: AppSettings) {
        self.settings = settings
    }

    var isEnabled: Bool { settings.iCloudSync }

    func startIfNeeded() {
        guard settings.iCloudSync else { return }
        // CloudKit container wiring deferred; toggle gate is enforced.
        Log.info("CloudSync: enabled (stub)")
    }

    func syncNow() async {
        guard settings.iCloudSync else { return }
        isSyncing = true
        defer { isSyncing = false }
        // Placeholder for CKSyncEngine push/pull.
        try? await Task.sleep(nanoseconds: 200_000_000)
        lastSyncedAt = Date()
        Log.info("CloudSync: stub sync completed")
    }

    func setEnabled(_ enabled: Bool) {
        settings.iCloudSync = enabled
        if enabled {
            startIfNeeded()
        } else {
            Log.info("CloudSync: disabled")
        }
    }
}
