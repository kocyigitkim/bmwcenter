import UIKit
import CarPlay

enum GaugeIconRenderer {
    private static let cache = NSCache<NSString, UIImage>()

    enum Semantic: Int, CaseIterable {
        case nominal = 0
        case attention = 1
        case critical = 2
        case inactive = 3

        var color: UIColor {
            switch self {
            case .nominal: SemanticColor.nominal.uiColor
            case .attention: SemanticColor.attention.uiColor
            case .critical: SemanticColor.critical.uiColor
            case .inactive: SemanticColor.inactive.uiColor
            }
        }

        static func from(progress: Double) -> Semantic {
            if progress >= 0.9 { return .critical }
            if progress >= 0.7 { return .attention }
            return .nominal
        }
    }

    static func icon(
        progress: Double,
        semantic: Semantic? = nil,
        size: CGSize = CPListItem.maximumImageSize
    ) -> UIImage {
        let clamped = min(max(progress, 0), 1)
        let bucket = Int((clamped * 20).rounded()) // 0...20 → 5% steps (21 buckets)
        let sem = semantic ?? Semantic.from(progress: clamped)
        let key = "\(bucket)-\(sem.rawValue)-\(Int(size.width))x\(Int(size.height))" as NSString
        if let cached = cache.object(forKey: key) { return cached }

        let format = UIGraphicsImageRendererFormat()
        format.scale = UITraitCollection.current.displayScale
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let image = renderer.image { ctx in
            let cg = ctx.cgContext
            let inset = size.width * 0.08
            let rect = CGRect(origin: .zero, size: size).insetBy(dx: inset, dy: inset)
            let lineWidth = size.width * 0.16
            let center = CGPoint(x: rect.midX, y: rect.midY)
            let radius = min(rect.width, rect.height) / 2 - lineWidth / 2

            cg.setLineWidth(lineWidth)
            cg.setLineCap(.round)

            // Background 270° arc from 135°
            cg.setStrokeColor(UIColor.tertiaryLabel.withAlphaComponent(0.4).cgColor)
            cg.addArc(
                center: center,
                radius: radius,
                startAngle: .pi * 0.75,
                endAngle: .pi * 0.75 + .pi * 1.5,
                clockwise: false
            )
            cg.strokePath()

            let end = .pi * 0.75 + .pi * 1.5 * (Double(bucket) / 20.0)
            cg.setStrokeColor(sem.color.cgColor)
            cg.addArc(
                center: center,
                radius: radius,
                startAngle: .pi * 0.75,
                endAngle: end,
                clockwise: false
            )
            cg.strokePath()
        }
        let final = image.withRenderingMode(.alwaysOriginal)
        cache.setObject(final, forKey: key)
        return final
    }

    /// Legacy overload for call sites passing a tint — maps to nearest semantic.
    static func icon(progress: Double, tint: UIColor, size: CGSize = CPListItem.maximumImageSize) -> UIImage {
        icon(progress: progress, semantic: .from(progress: min(max(progress, 0), 1)), size: size)
    }
}
