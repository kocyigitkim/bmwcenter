import SwiftUI
import UIKit

/// Renders one dashboard widget from catalog + live snapshot.
struct DashboardWidgetView: View {
    enum Placement {
        case gridCell
        case heroFull
        case heroDual
    }

    let item: DashboardWidgetItem
    let placement: Placement
    var gaugeDiameter: CGFloat? = nil

    @EnvironmentObject private var env: AppEnvironment
    @EnvironmentObject private var obd: OBDService
    @Environment(AppSettings.self) private var settings
    var isEditing: Bool = false

    private var snapshot: VehicleSnapshot { obd.snapshot }

    private var connected: Bool {
        if case .connected = obd.connection { return true }
        return false
    }

    var body: some View {
        Group {
            switch item.id {
            case .vehicleScan:
                scanCard
            case .parking:
                parkingCard
            case .dailyFuel:
                dailyFuelCard
            default:
                if usesGauge {
                    gauge
                } else {
                    tile
                }
            }
        }
    }

    private var usesGauge: Bool {
        if item.id.alwaysRendersGauge { return true }
        if item.size == .hero, item.id.rendersGaugeWhenHero { return true }
        return false
    }

    private var gaugeSize: GaugeRing.Size {
        switch placement {
        case .heroFull, .heroDual: return .hero
        case .gridCell: return .compact
        }
    }

    @ViewBuilder
    private var gauge: some View {
        let spec = gaugeSpec
        GaugeRing(
            value: spec.value,
            range: spec.range,
            zones: spec.zones,
            unit: spec.unit,
            caption: spec.caption,
            size: gaugeSize,
            diameter: gaugeDiameter,
            precision: spec.precision,
            freshness: spec.freshness,
            emptyReason: spec.emptyReason
        )
        .frame(maxWidth: .infinity)
        .padding(DSSpace.s2)
        .glassSurface(.card)
    }

    @ViewBuilder
    private var tile: some View {
        let spec = tileSpec
        MetricTile(
            label: spec.label,
            systemImage: spec.systemImage,
            valueText: spec.valueText,
            unit: spec.unit,
            variant: spec.variant,
            freshness: spec.freshness,
            emptyReason: spec.emptyReason,
            progress: spec.progress,
            zones: spec.zones,
            range: spec.range,
            value: spec.value,
            trend: spec.trend
        )
    }

    private var scanCard: some View {
        let card = HStack(spacing: DSSpace.s3) {
            Image(systemName: "stethoscope")
                .font(.system(size: 28))
                .foregroundStyle(Color.brandPrimary)
            VStack(alignment: .leading, spacing: 4) {
                Text(String(localized: "scan.action", table: "Localizable"))
                    .font(DSFont.title())
                    .foregroundStyle(Color.contentPrimary)
                Text(String(localized: "scan.dashboardHint", table: "Localizable"))
                    .font(DSFont.caption())
                    .foregroundStyle(Color.contentSecondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .foregroundStyle(Color.contentTertiary)
        }
        .padding(DSSpace.cardPadding)
        .glassSurface(.card)

        return Group {
            if isEditing {
                card
            } else {
                NavigationLink {
                    VehicleScanView()
                } label: {
                    card
                }
                .buttonStyle(.plain)
            }
        }
        .accessibilityIdentifier("dashboard.scanCard")
    }

    private var parkingCard: some View {
        let lat = settings.lastParkingLatitude
        let lon = settings.lastParkingLongitude
        let hasLocation = lat != nil && lon != nil

        let card = HStack(spacing: DSSpace.s3) {
            Image(systemName: "parkingsign.circle.fill")
                .font(.system(size: 28))
                .foregroundStyle(Color.brandPrimary)
            VStack(alignment: .leading, spacing: 4) {
                Text(String(localized: "parking.findCar", table: "Localizable"))
                    .font(DSFont.title())
                    .foregroundStyle(Color.contentPrimary)
                Text(parkingSubtitle(hasLocation: hasLocation))
                    .font(DSFont.caption())
                    .foregroundStyle(Color.contentSecondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .foregroundStyle(Color.contentTertiary)
        }
        .padding(DSSpace.cardPadding)
        .glassSurface(.card)

        return Group {
            if isEditing || !hasLocation {
                card
                    .opacity(hasLocation ? 1 : 0.7)
            } else if let lat, let lon {
                Button {
                    openWalkingDirections(lat: lat, lon: lon)
                } label: {
                    card
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var dailyFuelCard: some View {
        let summary = env.tripRepository.summary(for: todayInterval)
        let card = HStack(spacing: DSSpace.s3) {
            Image(systemName: "fuelpump.circle.fill")
                .font(.system(size: 28))
                .foregroundStyle(Color.brandPrimary)
            VStack(alignment: .leading, spacing: 4) {
                Text(String(localized: "dashboard.dailyFuel.title", table: "Localizable"))
                    .font(DSFont.title())
                    .foregroundStyle(Color.contentPrimary)
                HStack(spacing: 6) {
                    Text(Formatters.liters(summary.fuelUsedL))
                        .font(DSFont.label())
                        .dsMetricDigit()
                        .foregroundStyle(Color.contentPrimary)
                    Text("·")
                        .foregroundStyle(Color.contentTertiary)
                    Text(dailyFuelAverageText(summary))
                        .font(DSFont.caption())
                        .foregroundStyle(Color.contentSecondary)
                }
            }
            Spacer()
            Image(systemName: "chevron.right")
                .foregroundStyle(Color.contentTertiary)
        }
        .padding(DSSpace.cardPadding)
        .glassSurface(.card)

        return Group {
            if isEditing {
                card
            } else {
                NavigationLink {
                    FuelView()
                } label: {
                    card
                }
                .buttonStyle(.plain)
            }
        }
        .accessibilityIdentifier("dashboard.dailyFuelCard")
    }

    private var todayInterval: DateInterval {
        let start = Calendar.current.startOfDay(for: Date())
        return DateInterval(start: start, end: start.addingTimeInterval(86400))
    }

    private func dailyFuelAverageText(_ summary: DrivingSummary) -> String {
        guard summary.fuelUsedL > 0 else {
            return String(localized: "dashboard.dailyFuel.noSpend", table: "Localizable")
        }
        let avgFormat = String(localized: "dashboard.dailyFuel.avgCost", table: "Localizable")
        return String(format: avgFormat, Formatters.currency(summary.estimatedCost, code: settings.currencyCode))
    }

    private func parkingSubtitle(hasLocation: Bool) -> String {
        if hasLocation {
            return settings.lastParkingPlaceName
                ?? String(localized: "parking.title", table: "Localizable")
        }
        return String(localized: "dashboard.parkingEmpty", table: "Localizable")
    }

    private func openWalkingDirections(lat: Double, lon: Double) {
        let url = URL(string: "http://maps.apple.com/?daddr=\(lat),\(lon)&dirflg=w")!
        UIApplication.shared.open(url)
    }

    // MARK: - Gauge / tile specs

    private struct GaugeSpec {
        var value: Double?
        var range: ClosedRange<Double>
        var zones: [GaugeZone]
        var unit: String
        var caption: String
        var precision: Int
        var freshness: DataFreshness
        var emptyReason: String?
    }

    private struct TileSpec {
        var label: String
        var systemImage: String
        var valueText: String?
        var unit: String
        var variant: MetricTile.Variant
        var freshness: DataFreshness
        var emptyReason: String?
        var progress: Double?
        var zones: [GaugeZone] = []
        var range: ClosedRange<Double> = 0...100
        var value: Double?
        var trend: [Double] = []
    }

    private var gaugeSpec: GaugeSpec {
        let caption = localized(item.id.titleKey)
        switch item.id {
        case .speed:
            let value = DashMetrics.displaySpeed(snapshot.speedKmh, settings: settings)
            return GaugeSpec(
                value: value,
                range: 0...220,
                zones: GaugeZone.speedZones(),
                unit: DashMetrics.speedUnit(settings: settings),
                caption: caption,
                precision: 0,
                freshness: freshness(for: value != nil),
                emptyReason: String(localized: "data.noData", table: "Localizable")
            )
        case .rpm:
            return GaugeSpec(
                value: snapshot.rpm,
                range: 0...7000,
                zones: GaugeZone.rpmZones(),
                unit: String(localized: "unit.rpm", table: "Localizable"),
                caption: caption,
                precision: 0,
                freshness: freshness(for: snapshot.rpm != nil),
                emptyReason: String(localized: "data.noData", table: "Localizable")
            )
        case .coolant:
            let value = DashMetrics.displayTemp(snapshot.coolantC, settings: settings)
            return GaugeSpec(
                value: value,
                range: DashMetrics.tempRange(settings: settings),
                zones: GaugeZone.coolantZones(celsius: settings.temperatureUnit == .celsius),
                unit: DashMetrics.tempUnit(settings: settings),
                caption: caption,
                precision: 0,
                freshness: freshness(for: value != nil),
                emptyReason: String(localized: "data.noData", table: "Localizable")
            )
        case .oilTemp:
            let value = DashMetrics.displayTemp(snapshot.oilTempC, settings: settings)
            return GaugeSpec(
                value: value,
                range: DashMetrics.tempRange(settings: settings),
                zones: GaugeZone.coolantZones(celsius: settings.temperatureUnit == .celsius),
                unit: DashMetrics.tempUnit(settings: settings),
                caption: caption,
                precision: 0,
                freshness: value == nil ? .unavailable : freshness(for: true),
                emptyReason: String(localized: "data.oilExtendedHint", table: "Localizable")
            )
        case .boost:
            let value = DashMetrics.boostValue(snapshot: snapshot, settings: settings)
            let range = DashMetrics.boostRange(settings: settings)
            return GaugeSpec(
                value: value,
                range: range,
                zones: DashMetrics.boostZones(range: range),
                unit: DashMetrics.boostUnit(settings: settings),
                caption: caption,
                precision: settings.pressureUnit == .kpa ? 0 : 2,
                freshness: value == nil ? .unavailable : freshness(for: true),
                emptyReason: emptyReason(for: item.id)
            )
        case .voltage:
            return GaugeSpec(
                value: snapshot.voltage,
                range: 10...16,
                zones: GaugeZone.voltageZones(),
                unit: String(localized: "unit.volt", table: "Localizable"),
                caption: caption,
                precision: 1,
                freshness: freshness(for: snapshot.voltage != nil),
                emptyReason: String(localized: "data.noData", table: "Localizable")
            )
        case .engineLoad:
            return GaugeSpec(
                value: snapshot.engineLoadPct,
                range: 0...100,
                zones: GaugeZone.percentZones(),
                unit: "%",
                caption: caption,
                precision: 0,
                freshness: freshness(for: snapshot.engineLoadPct != nil),
                emptyReason: String(localized: "data.noData", table: "Localizable")
            )
        case .transmissionOilTemp:
            let value = DashMetrics.displayTemp(snapshot.transmissionOilTempC, settings: settings)
            return GaugeSpec(
                value: value,
                range: DashMetrics.tempRange(settings: settings),
                zones: GaugeZone.coolantZones(celsius: settings.temperatureUnit == .celsius),
                unit: DashMetrics.tempUnit(settings: settings),
                caption: caption,
                precision: 0,
                freshness: value == nil ? .unavailable : freshness(for: true),
                emptyReason: emptyReason(for: item.id)
            )
        case .fuelRail:
            return GaugeSpec(
                value: snapshot.fuelRailBar,
                range: 0...200,
                zones: [
                    GaugeZone(from: 0, to: 50, semantic: .attention),
                    GaugeZone(from: 50, to: 170, semantic: .nominal),
                    GaugeZone(from: 170, to: 200, semantic: .attention)
                ],
                unit: String(localized: "unit.bar", table: "Localizable"),
                caption: caption,
                precision: 0,
                freshness: snapshot.fuelRailBar == nil ? .unavailable : freshness(for: true),
                emptyReason: emptyReason(for: item.id)
            )
        default:
            return GaugeSpec(
                value: nil,
                range: 0...100,
                zones: [],
                unit: "",
                caption: caption,
                precision: 0,
                freshness: .unavailable,
                emptyReason: String(localized: "data.noData", table: "Localizable")
            )
        }
    }

    private var tileSpec: TileSpec {
        let label = localized(item.id.titleKey)
        let icon = item.id.systemImage
        switch item.id {
        case .coolant:
            return barTempTile(
                label: label,
                icon: icon,
                celsius: snapshot.coolantC,
                empty: String(localized: "data.noData", table: "Localizable")
            )
        case .oilTemp:
            return barTempTile(
                label: label,
                icon: icon,
                celsius: snapshot.oilTempC,
                empty: String(localized: "data.oilExtendedHint", table: "Localizable")
            )
        case .engineLoad:
            return percentBar(label: label, icon: icon, value: snapshot.engineLoadPct)
        case .throttle:
            return percentBar(label: label, icon: icon, value: snapshot.throttlePct)
        case .pedal:
            return percentBar(label: label, icon: icon, value: snapshot.pedalPct)
        case .ignitionAdvance:
            return simple(
                label: label,
                icon: icon,
                text: snapshot.timingAdvance.map { MetricFormatter.number($0, fractionLength: 1) },
                unit: "°"
            )
        case .catalyst:
            return simple(
                label: label,
                icon: icon,
                text: DashMetrics.tempText(snapshot.catalystC, settings: settings),
                unit: DashMetrics.tempUnit(settings: settings)
            )
        case .instantConsumption:
            let text = DashMetrics.instantValueText(
                snapshot: snapshot,
                instantL100: obd.instantL100,
                idleLh: obd.idleLh,
                settings: settings
            )
            return TileSpec(
                label: label,
                systemImage: icon,
                valueText: text,
                unit: DashMetrics.instantUnit(snapshot: snapshot, idleLh: obd.idleLh, settings: settings),
                variant: .valueTrend,
                freshness: freshness(for: text != nil),
                emptyReason: String(localized: "data.noData", table: "Localizable"),
                trend: obd.recentConsumption
            )
        case .fuelLevel:
            return TileSpec(
                label: label,
                systemImage: icon,
                valueText: snapshot.fuelLevelPct.map { MetricFormatter.fuelLevel($0) },
                unit: "%",
                variant: .valueBar,
                freshness: freshness(for: snapshot.fuelLevelPct != nil),
                emptyReason: String(localized: "data.noData", table: "Localizable"),
                progress: (snapshot.fuelLevelPct ?? 0) / 100,
                zones: GaugeZone.fuelZones(),
                range: 0...100,
                value: snapshot.fuelLevelPct
            )
        case .range:
            let km = DashMetrics.rangeKm(
                snapshot: snapshot,
                instantL100: obd.instantL100,
                tankCapacityL: settings.tankCapacityL
            )
            return simple(
                label: label,
                icon: icon,
                text: km.map { MetricFormatter.distance($0) },
                unit: settings.unitSystem == .metric ? "km" : "mi",
                variant: .value
            )
        case .stft:
            return trimTile(label: label, icon: icon, value: snapshot.stftBank1)
        case .ltft:
            return trimTile(label: label, icon: icon, value: snapshot.ltftBank1)
        case .maf:
            let kgh = snapshot.mafKgh ?? snapshot.mafGs.map { $0 * 3.6 }
            return simple(
                label: label,
                icon: icon,
                text: kgh.map { MetricFormatter.number($0, fractionLength: 1) },
                unit: String(localized: "unit.kgh", table: "Localizable")
            )
        case .map:
            let value = DashMetrics.pressureValue(snapshot.mapKpa, settings: settings)
            return simple(
                label: label,
                icon: icon,
                text: value.map { MetricFormatter.number($0, fractionLength: settings.pressureUnit == .bar ? 2 : 0) },
                unit: DashMetrics.pressureUnitLabel(settings: settings)
            )
        case .iat:
            return simple(
                label: label,
                icon: icon,
                text: DashMetrics.tempText(snapshot.intakeAirC, settings: settings),
                unit: DashMetrics.tempUnit(settings: settings)
            )
        case .fuelRail:
            return simple(
                label: label,
                icon: icon,
                text: snapshot.fuelRailBar.map { MetricFormatter.number($0, fractionLength: 0) },
                unit: String(localized: "unit.bar", table: "Localizable"),
                extended: true
            )
        case .lowPressureFuel:
            return simple(
                label: label,
                icon: icon,
                text: snapshot.lowPressureFuelBar.map { MetricFormatter.number($0, fractionLength: 2) },
                unit: String(localized: "unit.bar", table: "Localizable"),
                extended: true
            )
        case .ecoScore:
            let score = env.care.liveEcoScore
            return TileSpec(
                label: label,
                systemImage: icon,
                valueText: MetricFormatter.number(score, fractionLength: 0),
                unit: "",
                variant: .value,
                freshness: .live,
                emptyReason: nil,
                value: score
            )
        case .boost:
            let text = DashMetrics.boostText(snapshot: snapshot, settings: settings)
            return simple(
                label: label,
                icon: icon,
                text: text,
                unit: DashMetrics.boostUnit(settings: settings),
                extended: true
            )
        case .boostSetpoint:
            return simple(
                label: label,
                icon: icon,
                text: DashMetrics.boostSetpointText(snapshot: snapshot, settings: settings),
                unit: DashMetrics.boostUnit(settings: settings),
                extended: true
            )
        case .intercooler:
            return simple(
                label: label,
                icon: icon,
                text: DashMetrics.tempText(snapshot.intercoolerC, settings: settings),
                unit: DashMetrics.tempUnit(settings: settings),
                extended: true
            )
        case .radiatorOutlet:
            return simple(
                label: label,
                icon: icon,
                text: DashMetrics.tempText(snapshot.radiatorOutletC, settings: settings),
                unit: DashMetrics.tempUnit(settings: settings),
                extended: true
            )
        case .ambient:
            return simple(
                label: label,
                icon: icon,
                text: DashMetrics.tempText(snapshot.ambientC, settings: settings),
                unit: DashMetrics.tempUnit(settings: settings)
            )
        case .transmissionOilTemp:
            return barTempTile(
                label: label,
                icon: icon,
                celsius: snapshot.transmissionOilTempC,
                empty: emptyReason(for: item.id)
            )
        case .voltage:
            return TileSpec(
                label: label,
                systemImage: icon,
                valueText: snapshot.voltage.map { MetricFormatter.voltage($0) },
                unit: String(localized: "unit.volt", table: "Localizable"),
                variant: .valueBar,
                freshness: freshness(for: snapshot.voltage != nil),
                emptyReason: String(localized: "data.noData", table: "Localizable"),
                progress: ((snapshot.voltage ?? 0) - 10) / 6,
                zones: GaugeZone.voltageZones(),
                range: 10...16,
                value: snapshot.voltage
            )
        case .batterySoc:
            return TileSpec(
                label: label,
                systemImage: icon,
                valueText: snapshot.batterySocPct.map { MetricFormatter.number($0, fractionLength: 0) },
                unit: "%",
                variant: snapshot.batterySocPct == nil ? .empty : .valueBar,
                freshness: snapshot.batterySocPct == nil ? .unavailable : freshness(for: true),
                emptyReason: emptyReason(for: item.id),
                progress: (snapshot.batterySocPct ?? 0) / 100,
                zones: GaugeZone.fuelZones(),
                range: 0...100,
                value: snapshot.batterySocPct
            )
        case .alternatorVoltage:
            let volts = snapshot.alternatorVoltage ?? snapshot.voltage
            return simple(
                label: label,
                icon: icon,
                text: volts.map { MetricFormatter.voltage($0) },
                unit: String(localized: "unit.volt", table: "Localizable"),
                extended: snapshot.alternatorVoltage == nil
            )
        case .vanosIntake:
            return simple(
                label: label,
                icon: icon,
                text: snapshot.vanosIntakeDeg.map { MetricFormatter.number($0, fractionLength: 1) },
                unit: "°",
                extended: true
            )
        case .vanosExhaust:
            return simple(
                label: label,
                icon: icon,
                text: snapshot.vanosExhaustDeg.map { MetricFormatter.number($0, fractionLength: 1) },
                unit: "°",
                extended: true
            )
        case .oilPressure:
            return TileSpec(
                label: label,
                systemImage: icon,
                valueText: snapshot.oilPressureBar.map { MetricFormatter.number($0, fractionLength: 2) },
                unit: String(localized: "unit.bar", table: "Localizable"),
                variant: snapshot.oilPressureBar == nil ? .empty : .valueBar,
                freshness: snapshot.oilPressureBar == nil ? .unavailable : freshness(for: true),
                emptyReason: emptyReason(for: item.id),
                progress: snapshot.oilPressureBar.map { min(max($0 / 6.0, 0), 1) },
                zones: GaugeZone.percentZones(),
                range: 0...6,
                value: snapshot.oilPressureBar
            )
        case .speed:
            let value = DashMetrics.displaySpeed(snapshot.speedKmh, settings: settings)
            return simple(
                label: label,
                icon: icon,
                text: value.map { MetricFormatter.speed($0) },
                unit: DashMetrics.speedUnit(settings: settings)
            )
        case .rpm:
            return simple(
                label: label,
                icon: icon,
                text: snapshot.rpm.map { MetricFormatter.rpm($0) },
                unit: String(localized: "unit.rpm", table: "Localizable")
            )
        case .vehicleScan, .parking, .dailyFuel:
            return simple(label: label, icon: icon, text: nil, unit: "")
        }
    }

    private func barTempTile(label: String, icon: String, celsius: Double?, empty: String) -> TileSpec {
        let value = DashMetrics.displayTemp(celsius, settings: settings)
        let range = DashMetrics.tempRange(settings: settings)
        return TileSpec(
            label: label,
            systemImage: icon,
            valueText: value.map { MetricFormatter.temperature($0) },
            unit: DashMetrics.tempUnit(settings: settings),
            variant: value == nil ? .empty : .valueBar,
            freshness: value == nil ? .unavailable : freshness(for: true),
            emptyReason: empty,
            progress: DashMetrics.progress(value, in: range),
            zones: GaugeZone.coolantZones(celsius: settings.temperatureUnit == .celsius),
            range: range,
            value: value
        )
    }

    private func percentBar(label: String, icon: String, value: Double?) -> TileSpec {
        TileSpec(
            label: label,
            systemImage: icon,
            valueText: value.map { MetricFormatter.number($0, fractionLength: 0) },
            unit: "%",
            variant: .valueBar,
            freshness: freshness(for: value != nil),
            emptyReason: String(localized: "data.noData", table: "Localizable"),
            progress: (value ?? 0) / 100,
            zones: GaugeZone.percentZones(),
            range: 0...100,
            value: value
        )
    }

    private func trimTile(label: String, icon: String, value: Double?) -> TileSpec {
        simple(
            label: label,
            icon: icon,
            text: value.map { MetricFormatter.number($0, fractionLength: 1) },
            unit: "%"
        )
    }

    private func simple(
        label: String,
        icon: String,
        text: String?,
        unit: String,
        variant: MetricTile.Variant = .value,
        extended: Bool = false
    ) -> TileSpec {
        TileSpec(
            label: label,
            systemImage: icon,
            valueText: text,
            unit: unit,
            variant: text == nil ? .empty : variant,
            freshness: text == nil ? .unavailable : freshness(for: true),
            emptyReason: extended
                ? emptyReason(for: item.id)
                : String(localized: "data.noData", table: "Localizable")
        )
    }

    private func emptyReason(for kind: DashboardWidgetKind) -> String {
        if kind.isExtendedOEM {
            return String(localized: "data.extendedPending", table: "Localizable")
        }
        return String(localized: "data.notSupported", table: "Localizable")
    }

    private func freshness(for hasValue: Bool) -> DataFreshness {
        DataFreshness.from(
            timestamp: snapshot.timestamp,
            connected: connected,
            supported: hasValue || connected,
            failed: false
        )
    }

    private func localized(_ key: String) -> String {
        String(localized: String.LocalizationValue(key), table: "Localizable")
    }
}

enum DashMetrics {
    static func displaySpeed(_ kmh: Double?, settings: AppSettings) -> Double? {
        guard let kmh else { return nil }
        return settings.unitSystem == .metric ? kmh : kmh * 0.621371
    }

    static func speedUnit(settings: AppSettings) -> String {
        settings.unitSystem == .metric
            ? String(localized: "unit.kmh", table: "Localizable")
            : String(localized: "unit.mph", table: "Localizable")
    }

    static func displayTemp(_ celsius: Double?, settings: AppSettings) -> Double? {
        guard let celsius else { return nil }
        return settings.temperatureUnit == .celsius ? celsius : celsius * 9 / 5 + 32
    }

    static func tempText(_ celsius: Double?, settings: AppSettings) -> String? {
        guard let value = displayTemp(celsius, settings: settings) else { return nil }
        return MetricFormatter.temperature(value)
    }

    static func tempUnit(settings: AppSettings) -> String {
        settings.temperatureUnit == .celsius
            ? String(localized: "unit.celsius", table: "Localizable")
            : String(localized: "unit.fahrenheit", table: "Localizable")
    }

    static func tempRange(settings: AppSettings) -> ClosedRange<Double> {
        settings.temperatureUnit == .celsius ? 0...160 : 32...320
    }

    static func progress(_ value: Double?, in range: ClosedRange<Double>) -> Double {
        guard let value else { return 0 }
        return min(max((value - range.lowerBound) / (range.upperBound - range.lowerBound), 0), 1)
    }

    static func boostValue(snapshot: VehicleSnapshot, settings: AppSettings) -> Double? {
        guard let bar = snapshot.boostBar else { return nil }
        switch settings.pressureUnit {
        case .bar: return bar
        case .kpa: return bar * 100
        case .psi: return bar * 100 * 0.145038
        }
    }

    static func boostText(snapshot: VehicleSnapshot, settings: AppSettings) -> String? {
        guard let value = boostValue(snapshot: snapshot, settings: settings) else { return nil }
        switch settings.pressureUnit {
        case .bar: return MetricFormatter.boost(value, unitIsBar: true)
        case .kpa: return MetricFormatter.boost(value, unitIsBar: false)
        case .psi: return MetricFormatter.number(value, fractionLength: 1)
        }
    }

    static func boostSetpointText(snapshot: VehicleSnapshot, settings: AppSettings) -> String? {
        guard let kpa = snapshot.boostSetpointKpa else { return nil }
        let baro = snapshot.baroKpa ?? 101.325
        let relBar = (kpa - baro) / 100.0
        switch settings.pressureUnit {
        case .bar: return MetricFormatter.boost(relBar, unitIsBar: true)
        case .kpa: return MetricFormatter.boost(relBar * 100, unitIsBar: false)
        case .psi: return MetricFormatter.number(relBar * 100 * 0.145038, fractionLength: 1)
        }
    }

    static func boostRange(settings: AppSettings) -> ClosedRange<Double> {
        switch settings.pressureUnit {
        case .bar: return -1.0...2.5
        case .kpa: return -100...250
        case .psi: return -15...36
        }
    }

    static func boostZones(range: ClosedRange<Double>) -> [GaugeZone] {
        let mid = range.lowerBound + (range.upperBound - range.lowerBound) * 0.55
        return [
            GaugeZone(from: range.lowerBound, to: 0, semantic: .cold),
            GaugeZone(from: 0, to: mid, semantic: .nominal),
            GaugeZone(from: mid, to: range.upperBound, semantic: .attention)
        ]
    }

    static func boostUnit(settings: AppSettings) -> String {
        switch settings.pressureUnit {
        case .bar: return "bar"
        case .kpa: return "kPa"
        case .psi: return "psi"
        }
    }

    static func pressureValue(_ kpa: Double?, settings: AppSettings) -> Double? {
        guard let kpa else { return nil }
        switch settings.pressureUnit {
        case .kpa: return kpa
        case .bar: return kpa / 100
        case .psi: return kpa * 0.145038
        }
    }

    static func pressureUnitLabel(settings: AppSettings) -> String {
        switch settings.pressureUnit {
        case .kpa: return String(localized: "unit.kpa", table: "Localizable")
        case .bar: return String(localized: "unit.bar", table: "Localizable")
        case .psi: return String(localized: "unit.psi", table: "Localizable")
        }
    }

    static func instantValueText(
        snapshot: VehicleSnapshot,
        instantL100: Double?,
        idleLh: Double?,
        settings: AppSettings
    ) -> String? {
        if let speed = snapshot.speedKmh, speed <= 3, let idle = idleLh {
            return MetricFormatter.consumption(idle)
        }
        guard let l100 = instantL100, l100 >= 0.5, l100 <= 60 else { return nil }
        let value: Double
        switch settings.consumptionUnit {
        case .l100km: value = l100
        case .kmPerL: value = 100 / l100
        case .mpgUS: value = 235.215 / l100
        case .mpgUK: value = 282.481 / l100
        }
        return MetricFormatter.consumption(value)
    }

    static func instantUnit(snapshot: VehicleSnapshot, idleLh: Double?, settings: AppSettings) -> String {
        if let speed = snapshot.speedKmh, speed <= 3, idleLh != nil {
            return String(localized: "unit.literPerHour", table: "Localizable")
        }
        switch settings.consumptionUnit {
        case .l100km: return String(localized: "unit.l100km", table: "Localizable")
        case .kmPerL: return String(localized: "unit.kmPerL", table: "Localizable")
        case .mpgUS: return String(localized: "unit.mpgUS", table: "Localizable")
        case .mpgUK: return String(localized: "unit.mpgUK", table: "Localizable")
        }
    }

    static func rangeKm(snapshot: VehicleSnapshot, instantL100: Double?, tankCapacityL: Double) -> Double? {
        let avg = FuelCalculator.isValidAvgL100(instantL100) ? instantL100 : nil
        let km = FuelCalculator.estimatedRangeKm(
            fuelLevelPct: snapshot.fuelLevelPct,
            tankCapacityL: tankCapacityL,
            avgL100: avg
        )
        return km
    }
}
