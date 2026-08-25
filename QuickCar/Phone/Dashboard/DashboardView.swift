import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var obd: OBDService
    @EnvironmentObject private var tripRecorder: TripRecorder
    @Environment(AppSettings.self) private var settings

    var body: some View {
        DashboardScreen(obd: obd, tripRecorder: tripRecorder, settings: settings)
    }
}

private struct DashboardScreen: View {
    @EnvironmentObject private var env: AppEnvironment
    @EnvironmentObject private var obd: OBDService
    @EnvironmentObject private var tripRecorder: TripRecorder
    @Environment(AppSettings.self) private var settings
    @StateObject private var viewModel: DashboardViewModel
    @State private var showScan = false
    @State private var showGallery = false
    @State private var scrollOffset: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(obd: OBDService, tripRecorder: TripRecorder, settings: AppSettings) {
        _viewModel = StateObject(wrappedValue: DashboardViewModel(
            obd: obd,
            tripRecorder: tripRecorder,
            settings: settings
        ))
    }

    private var pillCompact: Bool { scrollOffset > 40 }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: DSSpace.cardGap) {
                    pinnedChrome
                    widgetBody
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
            .toolbar { toolbarContent }
            .sheet(isPresented: $showScan) {
                AdapterScanView()
            }
            .sheet(isPresented: $showGallery) {
                DashboardWidgetGallery(viewModel: viewModel)
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Menu {
                ForEach(DashboardPreset.allCases) { preset in
                    Button {
                        viewModel.applyPreset(preset)
                    } label: {
                        if viewModel.layout.preset == preset, !viewModel.layout.isCustomized {
                            Label(localized(preset.titleKey), systemImage: "checkmark")
                        } else {
                            Text(localized(preset.titleKey))
                        }
                    }
                }
                Divider()
                Button(localized("dashboard.reset")) {
                    viewModel.resetToPreset()
                }
            } label: {
                Image(systemName: "square.grid.2x2")
                    .frame(minWidth: DSSpace.minTouch, minHeight: DSSpace.minTouch)
            }
            .accessibilityLabel(localized("dashboard.presets"))
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            if viewModel.isEditing {
                Button {
                    showGallery = true
                } label: {
                    Image(systemName: "plus")
                        .frame(minWidth: DSSpace.minTouch, minHeight: DSSpace.minTouch)
                }
                .accessibilityLabel(localized("dashboard.add"))
            }
            Button(viewModel.isEditing
                   ? localized("action.done")
                   : localized("dashboard.edit")) {
                withAnimation(MotionTokens.glassMorph(reduceMotion: reduceMotion)) {
                    viewModel.isEditing.toggle()
                }
            }
            .frame(minWidth: DSSpace.minTouch, minHeight: DSSpace.minTouch)
        }
    }

    // MARK: - Pinned chrome (not in layout)

    @ViewBuilder
    private var pinnedChrome: some View {
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

            if !env.care.isEngineReady {
                warmupRing
                    .padding(.horizontal, DSSpace.screenEdge)
            }

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

    private var warmupRing: some View {
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
        .padding(DSSpace.s2)
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
                viewModel.stopTrip()
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

    // MARK: - Layout body

    @ViewBuilder
    private var widgetBody: some View {
        let rows = viewModel.layout.packedRows()
        if rows.isEmpty {
            EmptyState(
                title: localized("dashboard.emptyTitle"),
                message: localized("dashboard.emptyMessage"),
                systemImage: "square.grid.2x2",
                actionTitle: localized("dashboard.add"),
                action: { showGallery = true }
            )
            .padding(.horizontal, DSSpace.screenEdge)
        } else {
            VStack(spacing: DSSpace.cardGap) {
                ForEach(rows) { row in
                    layoutRow(row)
                }
            }
            .padding(.horizontal, DSSpace.screenEdge)
        }
    }

    @ViewBuilder
    private func layoutRow(_ row: DashboardLayoutRow) -> some View {
        switch row {
        case .dualHero(let a, let b):
            dualHeroRow(a, b)
        case .hero(let item):
            editable(item, placement: .heroFull)
        case .pair(let a, let b):
            HStack(alignment: .top, spacing: DSSpace.cardGap) {
                editable(a, placement: .gridCell)
                if let b {
                    editable(b, placement: .gridCell)
                } else {
                    Color.clear.frame(maxWidth: .infinity)
                }
            }
        }
    }

    private func dualHeroRow(_ a: DashboardWidgetItem, _ b: DashboardWidgetItem) -> some View {
        GeometryReader { geo in
            let gap = DSSpace.cardGap
            let diameter = min(
                GaugeRing.Size.hero.diameter,
                max(120, (geo.size.width - gap) / 2)
            )
            HStack(spacing: gap) {
                editable(a, placement: .heroDual, diameter: diameter)
                editable(b, placement: .heroDual, diameter: diameter)
            }
            .frame(width: geo.size.width, height: diameter + DSSpace.s2 * 2)
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(2, contentMode: .fit)
        .frame(maxHeight: GaugeRing.Size.hero.diameter + DSSpace.s4)
    }

    private func editable(
        _ item: DashboardWidgetItem,
        placement: DashboardWidgetView.Placement,
        diameter: CGFloat? = nil
    ) -> some View {
        EditableDashboardItem(
            item: item,
            placement: placement,
            gaugeDiameter: diameter,
            viewModel: viewModel,
            isEditing: viewModel.isEditing,
            reduceMotion: reduceMotion
        )
    }

    private func localized(_ key: String) -> String {
        String(localized: String.LocalizationValue(key), table: "Localizable")
    }
}

private struct EditableDashboardItem: View {
    let item: DashboardWidgetItem
    let placement: DashboardWidgetView.Placement
    var gaugeDiameter: CGFloat? = nil
    @ObservedObject var viewModel: DashboardViewModel
    let isEditing: Bool
    let reduceMotion: Bool
    @State private var dropTargeted = false

    var body: some View {
        DashboardWidgetView(
            item: item,
            placement: placement,
            gaugeDiameter: gaugeDiameter,
            isEditing: isEditing
        )
        .frame(maxWidth: .infinity)
        .overlay(alignment: .topLeading) {
            if isEditing {
                hideButton
            }
        }
        .padding(.top, isEditing ? 10 : 0)
        .contentShape(Rectangle())
        .contextMenu {
            if isEditing {
                Button(localized("dashboard.sizeSmall")) {
                    viewModel.setSize(.small, for: item.id)
                }
                Button(localized("dashboard.sizeHero")) {
                    viewModel.setSize(.hero, for: item.id)
                }
                Divider()
                if viewModel.canMove(item.id, offset: -1) {
                    Button(localized("dashboard.moveUp")) {
                        viewModel.move(item.id, offset: -1)
                    }
                }
                if viewModel.canMove(item.id, offset: 1) {
                    Button(localized("dashboard.moveDown")) {
                        viewModel.move(item.id, offset: 1)
                    }
                }
                Button(role: .destructive) {
                    viewModel.hide(item.id)
                } label: {
                    Text(localized("dashboard.hide"))
                }
            }
        }
        .modifier(DashboardReorderSupport(
            enabled: isEditing,
            itemID: item.id,
            dropTargeted: $dropTargeted,
            onMove: { viewModel.move($0, before: item.id) }
        ))
        .overlay {
            if dropTargeted {
                RoundedRectangle(cornerRadius: DSRadius.tile, style: .continuous)
                    .stroke(Color.brandPrimary, lineWidth: 2)
            }
        }
        .accessibilityActions {
            if isEditing {
                Button(localized("dashboard.hide")) { viewModel.hide(item.id) }
                if viewModel.canMove(item.id, offset: -1) {
                    Button(localized("dashboard.moveUp")) { viewModel.move(item.id, offset: -1) }
                }
                if viewModel.canMove(item.id, offset: 1) {
                    Button(localized("dashboard.moveDown")) { viewModel.move(item.id, offset: 1) }
                }
                Button(localized("dashboard.sizeSmall")) { viewModel.setSize(.small, for: item.id) }
                Button(localized("dashboard.sizeHero")) { viewModel.setSize(.hero, for: item.id) }
            }
        }
        .animation(MotionTokens.glassMorph(reduceMotion: reduceMotion), value: isEditing)
    }

    private var hideButton: some View {
        Button {
            viewModel.hide(item.id)
        } label: {
            Image(systemName: "minus.circle.fill")
                .symbolRenderingMode(.palette)
                .foregroundStyle(.white, Color.semCritical)
                .font(.system(size: 22))
                .frame(width: DSSpace.minTouch, height: DSSpace.minTouch)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .offset(x: -10, y: -10)
        .accessibilityLabel("\(localized("dashboard.hide")), \(String(localized: String.LocalizationValue(item.id.titleKey), table: "Localizable"))")
    }

    private func localized(_ key: String) -> String {
        String(localized: String.LocalizationValue(key), table: "Localizable")
    }
}

private struct DashboardReorderSupport: ViewModifier {
    let enabled: Bool
    let itemID: DashboardWidgetKind
    @Binding var dropTargeted: Bool
    let onMove: (DashboardWidgetKind) -> Void

    func body(content: Content) -> some View {
        if enabled {
            content
                .draggable(itemID.rawValue) {
                    Text(String(localized: String.LocalizationValue(itemID.titleKey), table: "Localizable"))
                        .font(DSFont.label())
                        .padding(DSSpace.s3)
                        .glassSurface(.chip)
                }
                .dropDestination(for: String.self) { dropped, _ in
                    guard let raw = dropped.first,
                          let kind = DashboardWidgetKind(rawValue: raw)
                    else { return false }
                    onMove(kind)
                    return true
                } isTargeted: { targeted in
                    dropTargeted = targeted
                }
        } else {
            content
        }
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
