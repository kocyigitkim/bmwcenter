import SwiftUI
import UIKit

struct DashboardView: View {
    @EnvironmentObject private var env: AppEnvironment
    @EnvironmentObject private var obd: OBDService
    @EnvironmentObject private var tripRecorder: TripRecorder
    @Environment(AppSettings.self) private var settings
    @State private var showScan = false
    @State private var scrollOffset: CGFloat = 0

    private var connected: Bool {
        if case .connected = obd.connection { return true }
        return false
    }

    private var pillCompact: Bool { scrollOffset > 40 }
    private var gaugeScale: CGFloat { scrollOffset > 80 ? 0.92 : 1 }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: DSSpace.cardGap) {
                    glassCluster
                    vehicleScanCard
                        .padding(.horizontal, DSSpace.screenEdge)
                    SectionHeader(title: String(localized: "section.engine", table: "Localizable"))
                    engineGrid
                        .padding(.horizontal, DSSpace.screenEdge)
                    if showBMWSection {
                        SectionHeader(title: String(localized: "section.bmw", table: "Localizable"))
                        bmwPrimaryGauges
                            .padding(.horizontal, DSSpace.screenEdge)
                        SectionHeader(title: String(localized: "section.bmwAir", table: "Localizable"))
                        bmwAirGrid
                            .padding(.horizontal, DSSpace.screenEdge)
                        SectionHeader(title: String(localized: "section.bmwTempPressure", table: "Localizable"))
                        bmwTempPressureGrid
                            .padding(.horizontal, DSSpace.screenEdge)
                        SectionHeader(title: String(localized: "section.bmwBattery", table: "Localizable"))
                        bmwBatteryGrid
                            .padding(.horizontal, DSSpace.screenEdge)
                    }
                    SectionHeader(title: String(localized: "section.fuel", table: "Localizable"))
                    fuelGrid
                        .padding(.horizontal, DSSpace.screenEdge)
                    SectionHeader(title: String(localized: "section.electrical", table: "Localizable"))
                    electricalGrid
                        .padding(.horizontal, DSSpace.screenEdge)
                    if let lat = settings.lastParkingLatitude,
                       let lon = settings.lastParkingLongitude {
                        parkingCard(lat: lat, lon: lon)
                            .padding(.horizontal, DSSpace.screenEdge)
                    }
                    Color.clear.frame(height: DSSpace.s6)
                }
                .frame(maxWidth: .infinity)
                .background(
                    GeometryReader { geo in
                        Color.clear.preference(
                            key: ScrollOffsetKey.self,
                            value: -geo.frame(in: .named("dashboardScroll")).minY
                        )
                    }
                )
            }
            .coordinateSpace(name: "dashboardScroll")
            .onPreferenceChange(ScrollOffsetKey.self) { scrollOffset = max(0, $0) }
            .modifier(DashboardScrollChrome())
            .background(Color.canvas.ignoresSafeArea())
            .navigationTitle(String(localized: "tab.dashboard", table: "Localizable"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .sheet(isPresented: $showScan) {
                AdapterScanView()
            }
        }
    }

    // MARK: - Sections

    /// Glass surfaces grouped (≤6): pill, alerts, hero, trip strip, parking reserved outside.
    @ViewBuilder
    private var glassCluster: some View {
        let stack = VStack(spacing: DSSpace.cardGap) {
            ConnectionPill(
                connection: obd.connection,
                isMock: settings.useMockAdapter,
                onTap: { showScan = true },
                compact: pillCompact
            )
            .padding(.horizontal, DSSpace.screenEdge)
            .padding(.top, DSSpace.s2)

            AlertChipRow(alerts: env.alertEngine.activeAlerts + env.care.activeChips)

            heroGauges
                .scaleEffect(gaugeScale)
                .animation(MotionTokens.glassMorph, value: gaugeScale)
                .padding(.horizontal, DSSpace.screenEdge)

            careStatusRow
                .padding(.horizontal, DSSpace.screenEdge)

            if tripRecorder.state.isActive {
                activeTripStrip
                    .padding(.horizontal, DSSpace.screenEdge)
            }
        }
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: DSSpace.cardGap) { stack }
        } else {
            stack
        }
    }

    private var heroGauges: some View {
        VStack(spacing: DSSpace.s3) {
            GeometryReader { geo in
                let gap = DSSpace.cardGap
                let diameter = min(
                    GaugeRing.Size.hero.diameter,
                    max(120, (geo.size.width - gap) / 2)
                )
                HStack(spacing: gap) {
                    GaugeRing(
                        value: displaySpeed,
                        range: 0...220,
                        zones: GaugeZone.speedZones(),
                        unit: speedUnit,
                        caption: String(localized: "metric.speed", table: "Localizable"),
                        size: .hero,
                        diameter: diameter,
                        precision: 0,
                        freshness: freshness(for: displaySpeed != nil)
                    )
                    .frame(maxWidth: .infinity)

                    GaugeRing(
                        value: obd.snapshot.rpm,
                        range: 0...7000,
                        zones: GaugeZone.rpmZones(),
                        unit: String(localized: "unit.rpm", table: "Localizable"),
                        caption: String(localized: "metric.rpm", table: "Localizable"),
                        size: .hero,
                        diameter: diameter,
                        precision: 0,
                        freshness: freshness(for: obd.snapshot.rpm != nil)
                    )
                    .frame(maxWidth: .infinity)
                }
                .frame(width: geo.size.width, height: diameter)
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(2, contentMode: .fit)
            .frame(maxHeight: GaugeRing.Size.hero.diameter)

            if !env.care.isEngineReady {
                GaugeRing(
                    value: env.care.readiness * 100,
                    range: 0...100,
                    zones: [
                        GaugeZone(from: 0, to: 60, semantic: .cold),
                        GaugeZone(from: 60, to: 98, semantic: .attention),
                        GaugeZone(from: 98, to: 100, semantic: .nominal)
                    ],
                    unit: "%",
                    caption: env.care.readinessLabel
                        ?? String(localized: "ready.title", table: "Localizable"),
                    size: .compact,
                    precision: 0,
                    freshness: .live
                )
                .frame(maxWidth: .infinity)
            }
        }
        .padding(DSSpace.s2)
        .frame(maxWidth: .infinity)
        .glassSurface(.card)
    }

    private var careStatusRow: some View {
        HStack(spacing: DSSpace.s3) {
            if env.care.liveEcoScore < 100 || tripRecorder.state.isActive {
                HStack(spacing: DSSpace.s2) {
                    Text(String(localized: "coach.liveScore", table: "Localizable"))
                        .font(DSFont.label())
                        .foregroundStyle(Color.contentSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .layoutPriority(-1)
                    Text("\(Int(env.care.liveEcoScore.rounded()))")
                        .font(DSFont.label())
                        .dsMetricDigit()
                        .foregroundStyle(Color.contentPrimary)
                        .layoutPriority(1)
                }
            }
            if let oil = obd.snapshot.oilTempC {
                Spacer(minLength: DSSpace.s2)
                HStack(spacing: DSSpace.s2) {
                    Text(String(localized: "metric.oilTemp", table: "Localizable"))
                        .font(DSFont.label())
                        .foregroundStyle(Color.contentSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .layoutPriority(-1)
                    Text(String(format: "%.0f°", oil))
                        .font(DSFont.label())
                        .dsMetricDigit()
                        .foregroundStyle(Color.contentPrimary)
                        .layoutPriority(1)
                }
            }
            if let cd = env.care.thermalCountdownS, cd > 0 {
                Spacer(minLength: DSSpace.s2)
                HStack(spacing: DSSpace.s2) {
                    Text(String(localized: "thermal.title", table: "Localizable"))
                        .font(DSFont.label())
                        .foregroundStyle(Color.contentSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .layoutPriority(-1)
                    Text("\(Int(cd.rounded()))s")
                        .font(DSFont.label())
                        .dsMetricDigit()
                        .foregroundStyle(Color.semAttention)
                        .layoutPriority(1)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, DSSpace.s1)
    }

    private var activeTripStrip: some View {
        HStack(alignment: .center, spacing: DSSpace.s2) {
            Circle()
                .fill(Color.semCritical)
                .frame(width: 8, height: 8)
                .layoutPriority(1)

            ViewThatFits(in: .horizontal) {
                HStack(spacing: DSSpace.s2) {
                    tripMetric(MetricFormatter.liveDuration(tripRecorder.live.durationS), primary: true)
                    tripDot
                    tripMetric(Formatters.distance(tripRecorder.live.distanceKm, settings: settings))
                    tripDot
                    tripMetric(Formatters.consumption(l100km: tripRecorder.live.avgL100, settings: settings))
                }
                HStack(spacing: DSSpace.s2) {
                    tripMetric(MetricFormatter.liveDuration(tripRecorder.live.durationS), primary: true)
                    tripDot
                    tripMetric(Formatters.distance(tripRecorder.live.distanceKm, settings: settings))
                }
                tripMetric(MetricFormatter.liveDuration(tripRecorder.live.durationS), primary: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .layoutPriority(0)

            Button(String(localized: "trip.stop", table: "Localizable")) {
                tripRecorder.manualStop()
            }
            .font(DSFont.label())
            .foregroundStyle(Color.semCritical)
            .fixedSize()
            .layoutPriority(1)
        }
        .padding(.horizontal, DSSpace.s4)
        .padding(.vertical, DSSpace.s3)
        .frame(maxWidth: .infinity)
        .glassSurface(.chip)
    }

    private var tripDot: some View {
        Text("·").foregroundStyle(Color.contentTertiary)
    }

    private func tripMetric(_ text: String, primary: Bool = false) -> some View {
        Text(text)
            .font(DSFont.label())
            .dsMetricDigit()
            .foregroundStyle(primary ? Color.contentPrimary : Color.contentSecondary)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
    }

    private var engineGrid: some View {
        LazyVGrid(columns: twoCols, spacing: DSSpace.cardGap) {
            MetricTile(
                label: String(localized: "metric.coolant", table: "Localizable"),
                systemImage: "thermometer.medium",
                valueText: displayTemp.map { MetricFormatter.temperature($0) },
                unit: tempUnit,
                variant: .valueBar,
                freshness: freshness(for: displayTemp != nil),
                progress: tempProgress,
                zones: GaugeZone.coolantZones(celsius: settings.temperatureUnit == .celsius),
                range: tempDisplayRange,
                value: displayTemp
            )

            MetricTile(
                label: String(localized: "metric.oilTemp", table: "Localizable"),
                systemImage: "oilcan.fill",
                valueText: oilDisplay.map { MetricFormatter.temperature($0) },
                unit: tempUnit,
                variant: oilDisplay == nil ? .empty : .valueBar,
                freshness: oilDisplay == nil ? .unavailable : freshness(for: true),
                emptyReason: oilDisplay == nil
                    ? String(localized: "data.oilBMWHint", table: "Localizable")
                    : nil,
                progress: oilProgress,
                zones: GaugeZone.coolantZones(celsius: settings.temperatureUnit == .celsius),
                range: tempDisplayRange,
                value: oilDisplay
            )

            MetricTile(
                label: String(localized: "metric.engineLoad", table: "Localizable"),
                systemImage: "engine.combustion.fill",
                valueText: obd.snapshot.engineLoadPct.map { MetricFormatter.number($0, fractionLength: 0) },
                unit: "%",
                variant: .valueBar,
                freshness: freshness(for: obd.snapshot.engineLoadPct != nil),
                progress: (obd.snapshot.engineLoadPct ?? 0) / 100,
                zones: GaugeZone.percentZones(),
                range: 0...100,
                value: obd.snapshot.engineLoadPct
            )

            MetricTile(
                label: String(localized: "metric.throttle", table: "Localizable"),
                systemImage: "pedal.accelerator",
                valueText: obd.snapshot.throttlePct.map { MetricFormatter.number($0, fractionLength: 0) },
                unit: "%",
                variant: .valueBar,
                freshness: freshness(for: obd.snapshot.throttlePct != nil),
                progress: (obd.snapshot.throttlePct ?? 0) / 100,
                zones: GaugeZone.percentZones(),
                range: 0...100,
                value: obd.snapshot.throttlePct
            )
        }
    }

    private var fuelGrid: some View {
        LazyVGrid(columns: twoCols, spacing: DSSpace.cardGap) {
            MetricTile(
                label: String(localized: "metric.instant", table: "Localizable"),
                systemImage: "drop.fill",
                valueText: instantValueText,
                unit: instantUnit,
                variant: .valueTrend,
                freshness: freshness(for: instantValueText != nil),
                trend: obd.recentConsumption
            )

            MetricTile(
                label: String(localized: "metric.fuelLevel", table: "Localizable"),
                systemImage: "fuelpump.fill",
                valueText: obd.snapshot.fuelLevelPct.map { MetricFormatter.fuelLevel($0) },
                unit: "%",
                variant: .valueBar,
                freshness: freshness(for: obd.snapshot.fuelLevelPct != nil),
                progress: (obd.snapshot.fuelLevelPct ?? 0) / 100,
                zones: GaugeZone.fuelZones(),
                range: 0...100,
                value: obd.snapshot.fuelLevelPct
            )

            MetricTile(
                label: String(localized: "metric.range", table: "Localizable"),
                systemImage: "road.lanes",
                valueText: rangeKm.map { MetricFormatter.distance($0) },
                unit: settings.unitSystem == .metric ? "km" : "mi",
                variant: .value,
                freshness: freshness(for: rangeKm != nil)
            )

            if settings.isTurbo, !showBMWSection {
                MetricTile(
                    label: String(localized: "metric.boost", table: "Localizable"),
                    systemImage: "wind",
                    valueText: boostValueText,
                    unit: boostUnit,
                    variant: .value,
                    freshness: freshness(for: obd.snapshot.boostBar != nil)
                )
            }
        }
    }

    /// BMW Mode 22 — primary gauges (oil / gearbox / boost / rail).
    private var bmwPrimaryGauges: some View {
        LazyVGrid(columns: twoCols, spacing: DSSpace.cardGap) {
            bmwTempGauge(
                value: oilDisplay,
                caption: String(localized: "metric.oilTemp", table: "Localizable"),
                empty: String(localized: "data.oilBMWHint", table: "Localizable")
            )
            bmwTempGauge(
                value: transmissionOilDisplay,
                caption: String(localized: "metric.transmissionOilTemp", table: "Localizable"),
                empty: String(localized: "data.bmwPending", table: "Localizable")
            )
            GaugeRing(
                value: boostGaugeValue,
                range: boostGaugeRange,
                zones: boostGaugeZones,
                unit: boostUnit,
                caption: String(localized: "metric.boost", table: "Localizable"),
                size: .compact,
                precision: settings.pressureUnit == .kpa ? 0 : 2,
                freshness: boostGaugeValue == nil ? .unavailable : freshness(for: true),
                emptyReason: String(localized: "data.bmwPending", table: "Localizable")
            )
            .frame(maxWidth: .infinity)
            .padding(DSSpace.s2)
            .glassSurface(.card)

            GaugeRing(
                value: fuelRailDisplay,
                range: fuelRailRange,
                zones: [
                    GaugeZone(from: 0, to: fuelRailRange.upperBound * 0.25, semantic: .attention),
                    GaugeZone(from: fuelRailRange.upperBound * 0.25, to: fuelRailRange.upperBound * 0.85, semantic: .nominal),
                    GaugeZone(from: fuelRailRange.upperBound * 0.85, to: fuelRailRange.upperBound, semantic: .attention)
                ],
                unit: String(localized: "unit.bar", table: "Localizable"),
                caption: String(localized: "metric.fuelRail", table: "Localizable"),
                size: .compact,
                precision: 0,
                freshness: fuelRailDisplay == nil ? .unavailable : freshness(for: true),
                emptyReason: String(localized: "data.bmwPending", table: "Localizable")
            )
            .frame(maxWidth: .infinity)
            .padding(DSSpace.s2)
            .glassSurface(.card)

            MetricTile(
                label: String(localized: "metric.boostSetpoint", table: "Localizable"),
                systemImage: "target",
                valueText: boostSetpointText,
                unit: boostUnit,
                variant: boostSetpointText == nil ? .empty : .value,
                freshness: boostSetpointText == nil ? .unavailable : freshness(for: true),
                emptyReason: String(localized: "data.bmwPending", table: "Localizable")
            )
            MetricTile(
                label: String(localized: "metric.oilPressure", table: "Localizable"),
                systemImage: "gauge.with.dots.needle.33percent",
                valueText: oilPressureDisplay.map { MetricFormatter.number($0, fractionLength: 2) },
                unit: String(localized: "unit.bar", table: "Localizable"),
                variant: oilPressureDisplay == nil ? .empty : .valueBar,
                freshness: oilPressureDisplay == nil ? .unavailable : freshness(for: true),
                emptyReason: String(localized: "data.bmwPending", table: "Localizable"),
                progress: oilPressureDisplay.map { min(max($0 / 6.0, 0), 1) },
                zones: GaugeZone.percentZones(),
                range: 0...6,
                value: oilPressureDisplay
            )
        }
    }

    private var bmwAirGrid: some View {
        LazyVGrid(columns: twoCols, spacing: DSSpace.cardGap) {
            bmwTile(
                label: String(localized: "metric.ignitionAdvance", table: "Localizable"),
                icon: "flame",
                text: obd.snapshot.timingAdvance.map { MetricFormatter.number($0, fractionLength: 1) },
                unit: "°"
            )
            bmwTile(
                label: String(localized: "metric.throttle", table: "Localizable"),
                icon: "pedal.accelerator",
                text: obd.snapshot.throttlePct.map { MetricFormatter.number($0, fractionLength: 0) },
                unit: "%"
            )
            bmwTile(
                label: String(localized: "metric.pedal", table: "Localizable"),
                icon: "foot.print",
                text: obd.snapshot.pedalPct.map { MetricFormatter.number($0, fractionLength: 0) },
                unit: "%"
            )
            bmwTile(
                label: String(localized: "metric.maf", table: "Localizable"),
                icon: "wind",
                text: obd.snapshot.mafKgh.map { MetricFormatter.number($0, fractionLength: 1) },
                unit: String(localized: "unit.kgh", table: "Localizable")
            )
            bmwTile(
                label: String(localized: "metric.vanosIntake", table: "Localizable"),
                icon: "arrow.triangle.2.circlepath",
                text: obd.snapshot.vanosIntakeDeg.map { MetricFormatter.number($0, fractionLength: 1) },
                unit: "°"
            )
            bmwTile(
                label: String(localized: "metric.vanosExhaust", table: "Localizable"),
                icon: "arrow.triangle.2.circlepath",
                text: obd.snapshot.vanosExhaustDeg.map { MetricFormatter.number($0, fractionLength: 1) },
                unit: "°"
            )
        }
    }

    private var bmwTempPressureGrid: some View {
        LazyVGrid(columns: twoCols, spacing: DSSpace.cardGap) {
            bmwTile(
                label: String(localized: "metric.radiatorOutlet", table: "Localizable"),
                icon: "thermometer.medium",
                text: tempText(obd.snapshot.radiatorOutletC),
                unit: tempUnit
            )
            bmwTile(
                label: String(localized: "metric.intercooler", table: "Localizable"),
                icon: "snowflake",
                text: tempText(obd.snapshot.intercoolerC),
                unit: tempUnit
            )
            bmwTile(
                label: String(localized: "metric.ambient", table: "Localizable"),
                icon: "sun.max",
                text: tempText(obd.snapshot.ambientC),
                unit: tempUnit
            )
            bmwTile(
                label: String(localized: "metric.lowPressureFuel", table: "Localizable"),
                icon: "drop.triangle",
                text: obd.snapshot.lowPressureFuelBar.map { MetricFormatter.number($0, fractionLength: 2) },
                unit: String(localized: "unit.bar", table: "Localizable")
            )
        }
    }

    private var bmwBatteryGrid: some View {
        LazyVGrid(columns: twoCols, spacing: DSSpace.cardGap) {
            bmwTile(
                label: String(localized: "metric.alternatorVoltage", table: "Localizable"),
                icon: "bolt.car",
                text: (obd.snapshot.alternatorVoltage ?? obd.snapshot.voltage).map { MetricFormatter.voltage($0) },
                unit: String(localized: "unit.volt", table: "Localizable")
            )
            MetricTile(
                label: String(localized: "metric.batterySoc", table: "Localizable"),
                systemImage: "battery.100",
                valueText: obd.snapshot.batterySocPct.map { MetricFormatter.number($0, fractionLength: 0) },
                unit: "%",
                variant: obd.snapshot.batterySocPct == nil ? .empty : .valueBar,
                freshness: obd.snapshot.batterySocPct == nil ? .unavailable : freshness(for: true),
                emptyReason: String(localized: "data.bmwPending", table: "Localizable"),
                progress: (obd.snapshot.batterySocPct ?? 0) / 100,
                zones: GaugeZone.fuelZones(),
                range: 0...100,
                value: obd.snapshot.batterySocPct
            )
        }
    }

    private func bmwTempGauge(value: Double?, caption: String, empty: String) -> some View {
        GaugeRing(
            value: value,
            range: tempDisplayRange,
            zones: GaugeZone.coolantZones(celsius: settings.temperatureUnit == .celsius),
            unit: tempUnit,
            caption: caption,
            size: .compact,
            precision: 0,
            freshness: value == nil ? .unavailable : freshness(for: true),
            emptyReason: empty
        )
        .frame(maxWidth: .infinity)
        .padding(DSSpace.s2)
        .glassSurface(.card)
    }

    private func bmwTile(label: String, icon: String, text: String?, unit: String) -> some View {
        MetricTile(
            label: label,
            systemImage: icon,
            valueText: text,
            unit: unit,
            variant: text == nil ? .empty : .value,
            freshness: text == nil ? .unavailable : freshness(for: true),
            emptyReason: String(localized: "data.bmwPending", table: "Localizable")
        )
    }

    private func tempText(_ celsius: Double?) -> String? {
        guard let c = celsius else { return nil }
        let v = settings.temperatureUnit == .celsius ? c : c * 9 / 5 + 32
        return MetricFormatter.temperature(v)
    }

    private var electricalGrid: some View {
        LazyVGrid(columns: twoCols, spacing: DSSpace.cardGap) {
            MetricTile(
                label: String(localized: "metric.voltage", table: "Localizable"),
                systemImage: "bolt.batteryblock.fill",
                valueText: obd.snapshot.voltage.map { MetricFormatter.voltage($0) },
                unit: String(localized: "unit.volt", table: "Localizable"),
                variant: .valueBar,
                freshness: freshness(for: obd.snapshot.voltage != nil),
                progress: ((obd.snapshot.voltage ?? 0) - 10) / 6,
                zones: GaugeZone.voltageZones(),
                range: 10...16,
                value: obd.snapshot.voltage
            )

            MetricTile(
                label: String(localized: "metric.batterySoc", table: "Localizable"),
                systemImage: "minus.plus.batteryblock",
                valueText: obd.snapshot.batterySocPct.map { MetricFormatter.number($0, fractionLength: 0) }
                    ?? batteryHealthText,
                unit: obd.snapshot.batterySocPct != nil ? "%" : "",
                variant: (obd.snapshot.batterySocPct == nil && batteryHealthText == nil) ? .empty : .value,
                freshness: (obd.snapshot.batterySocPct == nil && batteryHealthText == nil) ? .unavailable : .live,
                emptyReason: String(localized: "data.noData", table: "Localizable")
            )
        }
    }

    /// PRD §26 Home Screen primary action: entry point to the Vehicle Scan
    /// screen (Phase 4). Deliberately just a navigation link, not an
    /// auto-triggered scan — running DTC/readiness reads on every Dashboard
    /// appearance would add unwanted traffic to the polling loop.
    private var vehicleScanCard: some View {
        NavigationLink {
            VehicleScanView()
        } label: {
            HStack(spacing: DSSpace.s3) {
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
        }
        .buttonStyle(.plain)
    }

    private func parkingCard(lat: Double, lon: Double) -> some View {
        Button {
            openWalkingDirections(lat: lat, lon: lon)
        } label: {
            HStack(spacing: DSSpace.s3) {
                Image(systemName: "parkingsign.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(Color.brandPrimary)
                VStack(alignment: .leading, spacing: 4) {
                    Text(String(localized: "parking.findCar", table: "Localizable"))
                        .font(DSFont.title())
                        .foregroundStyle(Color.contentPrimary)
                    Text(settings.lastParkingPlaceName
                         ?? String(localized: "parking.title", table: "Localizable"))
                        .font(DSFont.caption())
                        .foregroundStyle(Color.contentSecondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .foregroundStyle(Color.contentTertiary)
            }
            .padding(DSSpace.cardPadding)
            .glassSurface(.card)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Helpers

    private var twoCols: [GridItem] {
        [GridItem(.flexible(), spacing: DSSpace.cardGap), GridItem(.flexible(), spacing: DSSpace.cardGap)]
    }

    private func freshness(for hasValue: Bool) -> DataFreshness {
        DataFreshness.from(
            timestamp: obd.snapshot.timestamp,
            connected: connected,
            supported: hasValue || connected,
            failed: false
        )
    }

    private var displaySpeed: Double? {
        guard let kmh = obd.snapshot.speedKmh else { return nil }
        return settings.unitSystem == .metric ? kmh : kmh * 0.621371
    }

    private var speedUnit: String {
        settings.unitSystem == .metric
            ? String(localized: "unit.kmh", table: "Localizable")
            : String(localized: "unit.mph", table: "Localizable")
    }

    private var displayTemp: Double? {
        guard let c = obd.snapshot.coolantC else { return nil }
        return settings.temperatureUnit == .celsius ? c : c * 9 / 5 + 32
    }

    /// Real oil temp only (Mode 01 0x5C or BMW Mode 22 D3B0 via VLinker).
    private var oilDisplay: Double? {
        guard let c = obd.snapshot.oilTempC else { return nil }
        return settings.temperatureUnit == .celsius ? c : c * 9 / 5 + 32
    }

    private var oilPressureDisplay: Double? { obd.snapshot.oilPressureBar }

    private var showBMWSection: Bool {
        settings.vehiclePlatform != .universal
            || obd.snapshot.oilTempC != nil
            || obd.snapshot.transmissionOilTempC != nil
            || obd.snapshot.boostActualKpa != nil
            || obd.snapshot.fuelRailBar != nil
            || obd.snapshot.oilPressureBar != nil
    }

    private var transmissionOilDisplay: Double? {
        guard let c = obd.snapshot.transmissionOilTempC else { return nil }
        return settings.temperatureUnit == .celsius ? c : c * 9 / 5 + 32
    }

    private var fuelRailDisplay: Double? { obd.snapshot.fuelRailBar }

    private var fuelRailRange: ClosedRange<Double> { 0...200 }

    private var boostGaugeValue: Double? {
        guard let bar = obd.snapshot.boostBar else { return nil }
        switch settings.pressureUnit {
        case .bar: return bar
        case .kpa: return bar * 100
        case .psi: return bar * 100 * 0.145038
        }
    }

    private var boostGaugeRange: ClosedRange<Double> {
        switch settings.pressureUnit {
        case .bar: return -1.0...2.5
        case .kpa: return -100...250
        case .psi: return -15...36
        }
    }

    private var boostGaugeZones: [GaugeZone] {
        let r = boostGaugeRange
        let mid = r.lowerBound + (r.upperBound - r.lowerBound) * 0.55
        return [
            GaugeZone(from: r.lowerBound, to: 0, semantic: .cold),
            GaugeZone(from: 0, to: mid, semantic: .nominal),
            GaugeZone(from: mid, to: r.upperBound, semantic: .attention)
        ]
    }

    private var boostSetpointText: String? {
        guard let kpa = obd.snapshot.boostSetpointKpa else { return nil }
        let baro = obd.snapshot.baroKpa ?? 101.325
        let relBar = (kpa - baro) / 100.0
        switch settings.pressureUnit {
        case .bar: return MetricFormatter.boost(relBar, unitIsBar: true)
        case .kpa: return MetricFormatter.boost(relBar * 100, unitIsBar: false)
        case .psi: return MetricFormatter.number(relBar * 100 * 0.145038, fractionLength: 1)
        }
    }

    private var tempUnit: String {
        settings.temperatureUnit == .celsius
            ? String(localized: "unit.celsius", table: "Localizable")
            : String(localized: "unit.fahrenheit", table: "Localizable")
    }

    private var tempDisplayRange: ClosedRange<Double> {
        settings.temperatureUnit == .celsius ? 0...160 : 32...320
    }

    private var tempProgress: Double {
        guard let t = displayTemp else { return 0 }
        let r = tempDisplayRange
        return min(max((t - r.lowerBound) / (r.upperBound - r.lowerBound), 0), 1)
    }

    private var oilProgress: Double {
        guard let t = oilDisplay else { return 0 }
        let r = tempDisplayRange
        return min(max((t - r.lowerBound) / (r.upperBound - r.lowerBound), 0), 1)
    }

    private var instantValueText: String? {
        if let speed = obd.snapshot.speedKmh, speed <= 3, let idle = obd.idleLh {
            return MetricFormatter.consumption(idle)
        }
        guard let l100 = obd.instantL100, l100 >= 0.5, l100 <= 60 else { return nil }
        let value: Double
        switch settings.consumptionUnit {
        case .l100km: value = l100
        case .kmPerL: value = 100 / l100
        case .mpgUS: value = 235.215 / l100
        case .mpgUK: value = 282.481 / l100
        }
        return MetricFormatter.consumption(value)
    }

    private var instantUnit: String {
        if let speed = obd.snapshot.speedKmh, speed <= 3, obd.idleLh != nil {
            return String(localized: "unit.literPerHour", table: "Localizable")
        }
        switch settings.consumptionUnit {
        case .l100km: return String(localized: "unit.l100km", table: "Localizable")
        case .kmPerL: return String(localized: "unit.kmPerL", table: "Localizable")
        case .mpgUS: return String(localized: "unit.mpgUS", table: "Localizable")
        case .mpgUK: return String(localized: "unit.mpgUK", table: "Localizable")
        }
    }

    private var rangeKm: Double? {
        FuelCalculator.estimatedRangeKm(
            fuelLevelPct: obd.snapshot.fuelLevelPct,
            tankCapacityL: settings.tankCapacityL,
            avgL100: nil
        )
    }

    private var boostValueText: String? {
        guard let bar = obd.snapshot.boostBar else { return nil }
        switch settings.pressureUnit {
        case .bar: return MetricFormatter.boost(bar, unitIsBar: true)
        case .kpa: return MetricFormatter.boost(bar * 100, unitIsBar: false)
        case .psi: return MetricFormatter.number(bar * 100 * 0.145038, fractionLength: 1)
        }
    }

    private var boostUnit: String {
        switch settings.pressureUnit {
        case .bar: return "bar"
        case .kpa: return "kPa"
        case .psi: return "psi"
        }
    }

    private var batteryHealthText: String? { nil }

    private func openWalkingDirections(lat: Double, lon: Double) {
        let url = URL(string: "http://maps.apple.com/?daddr=\(lat),\(lon)&dirflg=w")!
        UIApplication.shared.open(url)
    }
}

private struct ScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

private struct DashboardScrollChrome: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.scrollEdgeEffectStyle(.soft, for: .top)
        } else {
            content
        }
    }
}
