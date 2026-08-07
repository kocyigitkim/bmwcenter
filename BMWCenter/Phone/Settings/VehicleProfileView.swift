import SwiftUI

struct VehicleProfileView: View {
    @Bindable var settings: AppSettings

    var body: some View {
        Form {
            Section(String(localized: "settings.vehicle", table: "Localizable")) {
                TextField(String(localized: "settings.vehicleName", table: "Localizable"), text: $settings.vehicleName)
                Picker(String(localized: "settings.vehiclePlatform", table: "Localizable"), selection: $settings.vehiclePlatform) {
                    ForEach(VehiclePlatform.allCases, id: \.self) { platform in
                        Text(String(localized: String.LocalizationValue(platform.displayKey), table: "Localizable"))
                            .tag(platform)
                    }
                }
                Text(String(localized: "settings.vehiclePlatform.hint", table: "Localizable"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Picker(String(localized: "settings.fuelType", table: "Localizable"), selection: $settings.fuelType) {
                    ForEach(FuelType.allCases, id: \.self) { type in
                        Text(String(localized: String.LocalizationValue(type.displayKey), table: "Localizable")).tag(type)
                    }
                }
                HStack {
                    Text(String(localized: "settings.tankCapacity", table: "Localizable"))
                    Spacer()
                    TextField("", value: $settings.tankCapacityL, format: .number)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 80)
                    Text(String(localized: "unit.liter", table: "Localizable"))
                        .foregroundStyle(.secondary)
                }
                HStack {
                    Text(String(localized: "settings.displacement", table: "Localizable"))
                    Spacer()
                    TextField("", value: $settings.displacementL, format: .number)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 80)
                    Text("L")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle(String(localized: "settings.vehicle", table: "Localizable"))
    }
}
