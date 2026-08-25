import Foundation

enum DashboardPreset: String, Codable, CaseIterable, Identifiable, Sendable {
    case daily
    case performance
    case fuel
    case diagnostics
    case cooling
    case turbo
    case transmission

    var id: String { rawValue }

    var titleKey: String { "dashboard.preset.\(rawValue)" }
}

enum DashboardWidgetSize: String, Codable, Sendable {
    case small
    case hero
}

struct DashboardWidgetItem: Identifiable, Codable, Equatable, Sendable {
    var id: DashboardWidgetKind
    var size: DashboardWidgetSize
}

struct DashboardLayout: Codable, Equatable, Sendable {
    var preset: DashboardPreset
    var isCustomized: Bool
    var items: [DashboardWidgetItem]

    /// PRD §40 factory layouts. Daily is the default; it never includes
    /// extended OEM sensors or less-common PIDs (MAP / IAT / STFT / LTFT).
    static func factory(for preset: DashboardPreset) -> DashboardLayout {
        DashboardLayout(preset: preset, isCustomized: false, items: items(for: preset))
    }

    static func items(for preset: DashboardPreset) -> [DashboardWidgetItem] {
        switch preset {
        case .daily:
            return [
                .init(id: .speed, size: .hero),
                .init(id: .rpm, size: .hero),
                .init(id: .coolant, size: .small),
                .init(id: .fuelLevel, size: .small),
                .init(id: .voltage, size: .small),
                .init(id: .dailyFuel, size: .hero),
                .init(id: .vehicleScan, size: .hero)
            ]
        case .performance:
            return [
                .init(id: .rpm, size: .hero),
                .init(id: .boost, size: .small),
                .init(id: .boostSetpoint, size: .small),
                .init(id: .iat, size: .small),
                .init(id: .ignitionAdvance, size: .small),
                .init(id: .fuelRail, size: .small)
            ]
        case .fuel:
            return [
                .init(id: .instantConsumption, size: .hero),
                .init(id: .dailyFuel, size: .hero),
                .init(id: .fuelLevel, size: .small),
                .init(id: .range, size: .small),
                .init(id: .ecoScore, size: .small)
            ]
        case .diagnostics:
            return [
                .init(id: .engineLoad, size: .small),
                .init(id: .throttle, size: .small),
                .init(id: .stft, size: .small),
                .init(id: .ltft, size: .small),
                .init(id: .maf, size: .small),
                .init(id: .map, size: .small),
                .init(id: .vehicleScan, size: .hero)
            ]
        case .cooling:
            return [
                .init(id: .coolant, size: .hero),
                .init(id: .oilTemp, size: .hero),
                .init(id: .radiatorOutlet, size: .small),
                .init(id: .intercooler, size: .small),
                .init(id: .ambient, size: .small)
            ]
        case .turbo:
            return [
                .init(id: .boost, size: .hero),
                .init(id: .iat, size: .small),
                .init(id: .intercooler, size: .small),
                .init(id: .oilTemp, size: .small)
            ]
        case .transmission:
            return [
                .init(id: .transmissionOilTemp, size: .hero),
                .init(id: .engineLoad, size: .small),
                .init(id: .throttle, size: .small),
                .init(id: .pedal, size: .small)
            ]
        }
    }

    func sanitized() -> DashboardLayout {
        var seen = Set<DashboardWidgetKind>()
        let filtered = items.filter { item in
            guard !DashboardWidgetKind.reservedPinnedChromeIDs.contains(item.id.rawValue) else {
                return false
            }
            return seen.insert(item.id).inserted
        }
        return DashboardLayout(preset: preset, isCustomized: isCustomized, items: filtered)
    }

    mutating func hide(_ kind: DashboardWidgetKind) {
        let before = items.count
        items.removeAll { $0.id == kind }
        if items.count != before { isCustomized = true }
    }

    mutating func add(_ kind: DashboardWidgetKind, size: DashboardWidgetSize? = nil) {
        guard !items.contains(where: { $0.id == kind }) else { return }
        items.append(.init(id: kind, size: size ?? kind.defaultSize))
        isCustomized = true
    }

    mutating func setSize(_ size: DashboardWidgetSize, for kind: DashboardWidgetKind) {
        guard let index = items.firstIndex(where: { $0.id == kind }) else { return }
        guard items[index].size != size else { return }
        items[index].size = size
        isCustomized = true
    }

    mutating func move(_ kind: DashboardWidgetKind, before destination: DashboardWidgetKind) {
        guard kind != destination,
              let from = items.firstIndex(where: { $0.id == kind }),
              items.contains(where: { $0.id == destination })
        else { return }
        let item = items.remove(at: from)
        let insertAt = items.firstIndex(where: { $0.id == destination }) ?? items.endIndex
        items.insert(item, at: insertAt)
        isCustomized = true
    }

    mutating func move(_ kind: DashboardWidgetKind, offset: Int) {
        guard let from = items.firstIndex(where: { $0.id == kind }) else { return }
        let to = from + offset
        guard items.indices.contains(to) else { return }
        items.swapAt(from, to)
        isCustomized = true
    }

    mutating func applyPreset(_ preset: DashboardPreset) {
        self = .factory(for: preset)
    }

    var placedKinds: Set<DashboardWidgetKind> {
        Set(items.map(\.id))
    }

    func packedRows() -> [DashboardLayoutRow] {
        var rows: [DashboardLayoutRow] = []
        var smalls: [DashboardWidgetItem] = []
        var index = 0

        func flushSmalls() {
            var i = 0
            while i < smalls.count {
                let first = smalls[i]
                let second = i + 1 < smalls.count ? smalls[i + 1] : nil
                rows.append(.pair(first, second))
                i += second == nil ? 1 : 2
            }
            smalls.removeAll()
        }

        while index < items.count {
            let item = items[index]
            if item.size == .hero {
                flushSmalls()
                if item.id.isPairableHero,
                   index + 1 < items.count,
                   items[index + 1].size == .hero,
                   items[index + 1].id.isPairableHero {
                    rows.append(.dualHero(item, items[index + 1]))
                    index += 2
                } else {
                    rows.append(.hero(item))
                    index += 1
                }
            } else {
                smalls.append(item)
                index += 1
            }
        }
        flushSmalls()
        return rows
    }
}

enum DashboardLayoutRow: Equatable, Identifiable {
    case dualHero(DashboardWidgetItem, DashboardWidgetItem)
    case hero(DashboardWidgetItem)
    case pair(DashboardWidgetItem, DashboardWidgetItem?)

    var id: String {
        switch self {
        case .dualHero(let a, let b):
            return "dual-\(a.id.rawValue)-\(b.id.rawValue)"
        case .hero(let item):
            return "hero-\(item.id.rawValue)"
        case .pair(let a, let b):
            return "pair-\(a.id.rawValue)-\(b?.id.rawValue ?? "none")"
        }
    }
}
