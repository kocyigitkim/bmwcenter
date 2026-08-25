import SwiftUI

struct VehicleProfileView: View {
    @Bindable var settings: AppSettings
    @EnvironmentObject private var env: AppEnvironment
    @EnvironmentObject private var obd: OBDService

    private let catalog = VehicleProfileCatalog()

    @State private var isReadingVIN = false

    var body: some View {
        Form {
            identitySection
            profileSection
            vinSection
            overridesSection
        }
        .navigationTitle(String(localized: "settings.vehicle", table: "Localizable"))
        .onChange(of: settings.vehicleYear) { _, _ in env.vehicleProfile.applyFromSettings() }
    }

    private var identitySection: some View {
        Section(String(localized: "settings.vehicle.identity", table: "Localizable")) {
            TextField(
                String(localized: "settings.vehicle.placeholderName", table: "Localizable"),
                text: $settings.vehicleName
            )
        }
    }

    private var profileSection: some View {
        Section {
            NavigationLink {
                VehicleMakePickerView(catalog: catalog, settings: settings) {
                    env.vehicleProfile.applyFromSettings()
                }
            } label: {
                LabeledContent(String(localized: "settings.vehicle.make", table: "Localizable")) {
                    Text(displayMake(currentChoice?.make))
                        .foregroundStyle(currentChoice == nil ? .secondary : .primary)
                }
            }

            if let make = currentChoice?.make ?? inferredMake {
                NavigationLink {
                    VehicleModelPickerView(catalog: catalog, settings: settings, make: make) {
                        env.vehicleProfile.applyFromSettings()
                    }
                } label: {
                    LabeledContent(String(localized: "settings.vehicle.model", table: "Localizable")) {
                        Text(displayModel(currentChoice?.model, make: make))
                            .foregroundStyle(currentChoice == nil ? .secondary : .primary)
                    }
                }
            }

            if let choice = currentChoice {
                let engines = catalog.variants(make: choice.make, model: choice.model)
                if engines.count > 1 {
                    Picker(String(localized: "settings.vehicle.engine", table: "Localizable"), selection: profileIdBinding) {
                        ForEach(engines) { engine in
                            Text(displayEngine(engine)).tag(engine.id)
                        }
                    }
                }

                yearPicker(for: choice)
            }

            Text(pidHint)
                .font(.footnote)
                .foregroundStyle(.secondary)
        } header: {
            Text(String(localized: "settings.vehicle.profile", table: "Localizable"))
        }
    }

    private var vinSection: some View {
        Section {
            TextField(String(localized: "settings.vehicle.vin", table: "Localizable"), text: $settings.lastVIN)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .font(.body.monospaced())

            if let suggestion = detectedSuggestion {
                Button {
                    applyDetected(suggestion)
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(String(localized: "settings.vehicle.useDetected", table: "Localizable"))
                        Text(suggestion.summary)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                }
            }

            Button {
                Task { await readVINFromAdapter() }
            } label: {
                if isReadingVIN {
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                } else {
                    Text(String(localized: "settings.vehicle.readVIN", table: "Localizable"))
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                }
            }
            .disabled(isReadingVIN)
        }
    }

    private var overridesSection: some View {
        Section(String(localized: "settings.vehicle.overrides", table: "Localizable")) {
            Picker(String(localized: "settings.fuelType", table: "Localizable"), selection: $settings.fuelType) {
                ForEach(FuelType.allCases, id: \.self) { type in
                    Text(String(localized: String.LocalizationValue(type.displayKey), table: "Localizable")).tag(type)
                }
            }
            Toggle(String(localized: "settings.vehicle.isTurbo", table: "Localizable"), isOn: $settings.isTurbo)
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
        .onChange(of: settings.fuelType) { _, _ in env.vehicleProfile.applyFromSettings() }
        .onChange(of: settings.isTurbo) { _, _ in env.vehicleProfile.applyFromSettings() }
    }

    @ViewBuilder
    private func yearPicker(for choice: VehicleProfileChoice) -> some View {
        let range = yearRange(for: choice)
        Picker(yearLabel(hasPackYears: choice.yearFrom != nil || choice.yearTo != nil), selection: $settings.vehicleYear) {
            Text(String(localized: "settings.vehicle.noYear", table: "Localizable")).tag(0)
            ForEach(Array(range), id: \.self) { year in
                Text(String(year)).tag(year)
            }
        }
    }

    private var currentChoice: VehicleProfileChoice? {
        catalog.choice(id: settings.vehicleProfileId)
    }

    private var inferredMake: String? {
        currentChoice?.make
    }

    private var detectedSuggestion: VehicleProfileChoice? {
        let vin = settings.lastVIN.trimmingCharacters(in: .whitespacesAndNewlines)
        guard vin.count == 17 else { return nil }
        return catalog.suggestion(vin: vin)
    }

    private var profileIdBinding: Binding<String> {
        Binding(
            get: { settings.vehicleProfileId },
            set: { newId in
                if let choice = catalog.choice(id: newId) {
                    catalog.apply(choice, to: settings, year: settings.vehicleYear > 0 ? settings.vehicleYear : nil)
                    env.vehicleProfile.applyFromSettings()
                }
            }
        )
    }

    private var pidHint: String {
        if settings.vehiclePlatform.supportsExtendedPIDs {
            return String(localized: "settings.vehicle.pidHint.bmw", table: "Localizable")
        }
        return String(localized: "settings.vehicle.pidHint.universal", table: "Localizable")
    }

    private func yearLabel(hasPackYears: Bool) -> String {
        String(
            localized: String.LocalizationValue(
                hasPackYears ? "settings.vehicle.year" : "settings.vehicle.yearOptional"
            ),
            table: "Localizable"
        )
    }

    private func yearRange(for choice: VehicleProfileChoice) -> ClosedRange<Int> {
        if let from = choice.yearFrom, let to = choice.yearTo, from <= to {
            return from...to
        }
        if let from = choice.yearFrom {
            return from...max(from, 2027)
        }
        return 1990...2027
    }

    private func displayMake(_ make: String?) -> String {
        guard let make, !make.isEmpty else {
            return String(localized: "settings.vehicle.pickMake", table: "Localizable")
        }
        if make == VehicleProfileCatalog.universalMake {
            return String(localized: "settings.vehicle.universalMake", table: "Localizable")
        }
        return make
    }

    private func displayModel(_ model: String?, make: String) -> String {
        guard let model, !model.isEmpty else {
            return String(localized: "settings.vehicle.pickModel", table: "Localizable")
        }
        return localizedModel(model, make: make)
    }

    private func displayEngine(_ choice: VehicleProfileChoice) -> String {
        if choice.make == VehicleProfileCatalog.universalMake
            || choice.model == VehicleProfileCatalog.otherModel {
            return String(localized: String.LocalizationValue(choice.archetype.displayKey), table: "Localizable")
        }
        return choice.engineLabel
    }

    private func applyDetected(_ suggestion: VehicleProfileChoice) {
        let year = VINDecoder.decode(settings.lastVIN)?.modelYear
        catalog.apply(suggestion, to: settings, year: year)
        env.vehicleProfile.applyFromSettings()
    }

    private func readVINFromAdapter() async {
        isReadingVIN = true
        defer { isReadingVIN = false }
        guard let vin = try? await obd.readVIN() else { return }
        settings.lastVIN = vin
        if let suggestion = catalog.suggestion(vin: vin) {
            applyDetected(suggestion)
        }
    }
}

private func localizedModel(_ model: String, make: String) -> String {
    if model == VehicleProfileCatalog.otherModel {
        return String(localized: "settings.vehicle.otherModel", table: "Localizable")
    }
    if make == VehicleProfileCatalog.universalMake {
        switch model {
        case "Any car":
            return String(localized: "settings.vehicle.anyCar", table: "Localizable")
        case "Gasoline":
            return String(localized: "fuelType.gasoline", table: "Localizable")
        case "Diesel":
            return String(localized: "fuelType.diesel", table: "Localizable")
        case "Hybrid":
            return String(localized: "vehicle.archetype.hybridFHEV", table: "Localizable")
        case "Electric":
            return String(localized: "vehicle.archetype.ev", table: "Localizable")
        default:
            break
        }
    }
    return model
}

private struct VehicleMakePickerView: View {
    let catalog: VehicleProfileCatalog
    @Bindable var settings: AppSettings
    var onApply: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var filtered: [String] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if q.isEmpty { return catalog.makes }
        return catalog.makes.filter { $0.localizedCaseInsensitiveContains(q) }
    }

    var body: some View {
        List(filtered, id: \.self) { make in
            Button {
                select(make)
            } label: {
                HStack {
                    Text(make == VehicleProfileCatalog.universalMake
                         ? String(localized: "settings.vehicle.universalMake", table: "Localizable")
                         : make)
                    Spacer()
                    if catalog.choice(id: settings.vehicleProfileId)?.make == make {
                        Image(systemName: "checkmark")
                    }
                }
                .frame(minHeight: 44)
            }
        }
        .searchable(text: $query, prompt: String(localized: "settings.vehicle.searchMake", table: "Localizable"))
        .navigationTitle(String(localized: "settings.vehicle.make", table: "Localizable"))
    }

    private func select(_ make: String) {
        let models = catalog.models(for: make)
        if make == VehicleProfileCatalog.universalMake, let anyCar = catalog.choice(id: VehicleProfileIDs.universalOBD2) {
            catalog.apply(anyCar, to: settings)
        } else if let first = models.first, first != VehicleProfileCatalog.otherModel,
                  let choice = catalog.variants(make: make, model: first).first {
            catalog.apply(choice, to: settings)
        } else if let generic = catalog.variants(make: make, model: VehicleProfileCatalog.otherModel).first {
            catalog.apply(generic, to: settings)
        }
        onApply()
        dismiss()
    }
}

private struct VehicleModelPickerView: View {
    let catalog: VehicleProfileCatalog
    @Bindable var settings: AppSettings
    let make: String
    var onApply: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var filtered: [String] {
        let models = catalog.models(for: make)
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if q.isEmpty { return models }
        return models.filter { $0.localizedCaseInsensitiveContains(q) }
    }

    var body: some View {
        List(filtered, id: \.self) { model in
            Button {
                select(model)
            } label: {
                HStack {
                    Text(localizedModel(model, make: make))
                    Spacer()
                    if catalog.choice(id: settings.vehicleProfileId)?.model == model {
                        Image(systemName: "checkmark")
                    }
                }
                .frame(minHeight: 44)
            }
        }
        .searchable(text: $query, prompt: String(localized: "settings.vehicle.searchModel", table: "Localizable"))
        .navigationTitle(String(localized: "settings.vehicle.model", table: "Localizable"))
    }

    private func select(_ model: String) {
        if let choice = catalog.variants(make: make, model: model).first {
            catalog.apply(choice, to: settings)
            onApply()
        }
        dismiss()
    }
}
