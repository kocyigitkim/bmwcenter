import SwiftUI

struct AddReminderSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var env: AppEnvironment
    @State private var title = ""
    @State private var intervalKm: String = "10000"

    var body: some View {
        NavigationStack {
            Form {
                TextField(String(localized: "maintenance.title", table: "Localizable"), text: $title)
                TextField("km", text: $intervalKm)
                    .keyboardType(.numberPad)
            }
            .navigationTitle(String(localized: "maintenance.title", table: "Localizable"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", table: "Localizable")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "common.save", table: "Localizable")) {
                        let item = MaintenanceItem(
                            titleKey: "maintenance.oil",
                            customTitle: title.isEmpty ? nil : title,
                            intervalKm: Double(intervalKm)
                        )
                        env.tripRepository.context.insert(item)
                        env.tripRepository.save()
                        dismiss()
                    }
                }
            }
        }
    }
}
