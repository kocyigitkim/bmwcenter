import XCTest
@testable import QuickCar

final class DashboardLayoutTests: XCTestCase {
    func testDailyFactoryContents() {
        let daily = DashboardLayout.factory(for: .daily)
        XCTAssertEqual(daily.preset, .daily)
        XCTAssertFalse(daily.isCustomized)
        XCTAssertEqual(
            daily.items.map(\.id),
            [.speed, .rpm, .coolant, .fuelLevel, .voltage, .dailyFuel, .vehicleScan]
        )
        XCTAssertEqual(daily.items[0].size, .hero)
        XCTAssertEqual(daily.items[1].size, .hero)
        XCTAssertEqual(daily.items[2].size, .small)
        XCTAssertEqual(daily.items[6].size, .hero)
    }

    func testDailyExcludesUnsupportedAndExtended() {
        let kinds = Set(DashboardLayout.factory(for: .daily).items.map(\.id))
        let excluded: [DashboardWidgetKind] = [
            .vanosIntake, .vanosExhaust, .fuelRail, .transmissionOilTemp,
            .boost, .boostSetpoint, .oilPressure, .map, .iat, .stft, .ltft,
            .intercooler, .radiatorOutlet, .batterySoc
        ]
        for kind in excluded {
            XCTAssertFalse(kinds.contains(kind), "Daily must not include \(kind.rawValue)")
        }
        XCTAssertFalse(kinds.contains(where: \.isExtendedOEM))
    }

    func testCatalogIncludesMapIatFuelTrims() {
        let all = Set(DashboardWidgetKind.allCases)
        XCTAssertTrue(all.contains(.map))
        XCTAssertTrue(all.contains(.iat))
        XCTAssertTrue(all.contains(.stft))
        XCTAssertTrue(all.contains(.ltft))
    }

    func testPinnedChromeNeverInCatalogOrLayout() {
        let catalogIDs = Set(DashboardWidgetKind.allCases.map(\.rawValue))
        XCTAssertTrue(catalogIDs.isDisjoint(with: DashboardWidgetKind.reservedPinnedChromeIDs))
        for id in DashboardWidgetKind.reservedPinnedChromeIDs {
            XCTAssertNil(DashboardWidgetKind(rawValue: id), "Pinned chrome \(id) must not be a widget kind")
        }

        for preset in DashboardPreset.allCases {
            let ids = Set(DashboardLayout.factory(for: preset).items.map(\.id.rawValue))
            XCTAssertTrue(ids.isDisjoint(with: DashboardWidgetKind.reservedPinnedChromeIDs))
        }
    }

    func testDailyPacksSpeedRpmAsDualHero() {
        let rows = DashboardLayout.factory(for: .daily).packedRows()
        guard case .dualHero(let a, let b) = rows.first else {
            return XCTFail("Daily first row should be a dual speed/RPM hero")
        }
        XCTAssertEqual(a.id, .speed)
        XCTAssertEqual(b.id, .rpm)
        XCTAssertTrue(rows.contains { if case .hero(let item) = $0 { return item.id == .vehicleScan } else { return false } })
    }

    func testApplyPresetReplacesCustomLayout() {
        var layout = DashboardLayout.factory(for: .daily)
        layout.hide(.voltage)
        XCTAssertTrue(layout.isCustomized)
        layout.applyPreset(.performance)
        XCTAssertFalse(layout.isCustomized)
        XCTAssertEqual(layout.preset, .performance)
        XCTAssertEqual(
            layout.items.map(\.id),
            [.rpm, .boost, .boostSetpoint, .iat, .ignitionAdvance, .fuelRail]
        )
        XCTAssertFalse(layout.items.contains { $0.id == .voltage })
    }

    func testHideAndReorderPersistToUserDefaults() {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let settings = AppSettings(defaults: defaults)
        let store = DashboardLayoutStore()

        var layout = DashboardLayout.factory(for: .daily)
        layout.hide(.voltage)
        layout.move(.vehicleScan, before: .coolant)
        layout.setSize(.hero, for: .fuelLevel)
        store.save(layout, to: settings)

        XCTAssertNotNil(settings.dashboardLayoutJSON)

        let reloadedSettings = AppSettings(defaults: defaults)
        let loaded = store.load(from: reloadedSettings)
        XCTAssertTrue(loaded.isCustomized)
        XCTAssertEqual(loaded.preset, .daily)
        XCTAssertFalse(loaded.items.contains { $0.id == .voltage })
        XCTAssertEqual(loaded.items.map(\.id), [.speed, .rpm, .vehicleScan, .coolant, .fuelLevel, .dailyFuel])
        XCTAssertEqual(loaded.items.first(where: { $0.id == .fuelLevel })?.size, .hero)
    }

    func testCorruptJSONFallsBackToDaily() {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let settings = AppSettings(defaults: defaults)
        settings.dashboardLayoutJSON = "{not-json"
        let loaded = DashboardLayoutStore().load(from: settings)
        XCTAssertEqual(loaded, .factory(for: .daily))
    }

    func testAllPresetsHaveItems() {
        for preset in DashboardPreset.allCases {
            let layout = DashboardLayout.factory(for: preset)
            XCTAssertFalse(layout.items.isEmpty, "\(preset) factory should not be empty")
            XCTAssertEqual(Set(layout.items.map(\.id)).count, layout.items.count, "\(preset) has duplicate widgets")
        }
    }

    func testFuelDiagnosticsCoolingTurboTransmissionFactories() {
        XCTAssertEqual(
            DashboardLayout.factory(for: .fuel).items.map(\.id),
            [.instantConsumption, .dailyFuel, .fuelLevel, .range, .ecoScore]
        )
        XCTAssertTrue(DashboardLayout.factory(for: .diagnostics).items.contains { $0.id == .stft })
        XCTAssertTrue(DashboardLayout.factory(for: .cooling).items.contains { $0.id == .oilTemp })
        XCTAssertEqual(DashboardLayout.factory(for: .turbo).items.first?.id, .boost)
        XCTAssertEqual(DashboardLayout.factory(for: .transmission).items.first?.id, .transmissionOilTemp)
    }

    func testAddSanitizeAndMoveOffset() {
        var layout = DashboardLayout.factory(for: .daily)
        layout.add(.voltage)
        XCTAssertEqual(layout.items.filter { $0.id == .voltage }.count, 1)
        layout.add(.map)
        XCTAssertTrue(layout.isCustomized)
        XCTAssertTrue(layout.items.contains { $0.id == .map })

        let voltageIndex = layout.items.firstIndex { $0.id == .map }!
        layout.move(.map, offset: -1)
        XCTAssertEqual(layout.items.firstIndex { $0.id == .map }, voltageIndex - 1)

        layout.items.append(.init(id: .speed, size: .small))
        layout.items.insert(.init(id: DashboardWidgetKind.speed, size: .hero), at: 0)
        let clean = layout.sanitized()
        XCTAssertEqual(clean.items.filter { $0.id == .speed }.count, 1)
    }

    func testPerformancePresetPersistRoundTrip() {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let settings = AppSettings(defaults: defaults)
        var layout = DashboardLayout.factory(for: .daily)
        layout.applyPreset(.performance)
        layout.hide(.boostSetpoint)
        DashboardLayoutStore().save(layout, to: settings)
        let loaded = DashboardLayoutStore().load(from: AppSettings(defaults: defaults))
        XCTAssertEqual(loaded.preset, .performance)
        XCTAssertTrue(loaded.isCustomized)
        XCTAssertFalse(loaded.items.contains { $0.id == .boostSetpoint })
        XCTAssertTrue(loaded.items.contains { $0.id == .fuelRail })
    }
}
