import SwiftUI

struct AddRefuelSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppSettings.self) private var settings
    let onSave: (RefuelEntry) -> Void

    @State private var liters: String = ""
    @State private var price: String = ""
    @State private var odometer: String = ""
    @State private var station: String = ""
    @State private var note: String = ""
    @State private var isFullTank = true

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(String(localized: "fuel.liters", table: "Localizable"), text: $liters)
                        .keyboardType(.decimalPad)
                    TextField(String(localized: "fuel.pricePerLiter", table: "Localizable"), text: $price)
                        .keyboardType(.decimalPad)
                    Toggle(String(localized: "fuel.fullTank", table: "Localizable"), isOn: $isFullTank)
                    TextField("Odometer km", text: $odometer)
                        .keyboardType(.decimalPad)
                    TextField(String(localized: "fuel.station", table: "Localizable"), text: $station)
                    TextField(String(localized: "fuel.note", table: "Localizable"), text: $note)
                }
            }
            .navigationTitle(String(localized: "fuel.addRefuel", table: "Localizable"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "action.cancel", table: "Localizable")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "action.save", table: "Localizable")) { save() }
                        .disabled(Double(liters.replacingOccurrences(of: ",", with: ".")) == nil)
                }
            }
            .onAppear {
                price = String(format: "%.2f", settings.pricePerLiter)
            }
        }
    }

    private func save() {
        let l = Double(liters.replacingOccurrences(of: ",", with: ".")) ?? 0
        let p = Double(price.replacingOccurrences(of: ",", with: ".")) ?? settings.pricePerLiter
        let odo = Double(odometer.replacingOccurrences(of: ",", with: "."))
        let entry = RefuelEntry(
            liters: l,
            pricePerLiter: p,
            odometerKm: odo,
            isFullTank: isFullTank,
            stationName: station.isEmpty ? nil : station,
            note: note.isEmpty ? nil : note
        )
        onSave(entry)
        dismiss()
    }
}
