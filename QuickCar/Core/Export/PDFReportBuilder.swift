import UIKit

enum PDFReportBuilder {
    static func build(trips: [Trip], settings: AppSettings, vehicleName: String) -> URL? {
        let page = CGRect(x: 0, y: 0, width: 595, height: 842)
        let renderer = UIGraphicsPDFRenderer(bounds: page)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("quickcar-monthly-\(Int(Date().timeIntervalSince1970)).pdf")
        let summary = DrivingSummary(trips: trips, pricePerLiter: settings.pricePerLiter)
        do {
            try renderer.writePDF(to: url) { ctx in
                ctx.beginPage()
                let title = "QuickCar — \(vehicleName)"
                (title as NSString).draw(at: CGPoint(x: 40, y: 40), withAttributes: [
                    .font: UIFont.boldSystemFont(ofSize: 18)
                ])
                var y: CGFloat = 80
                let lines = [
                    "Trips: \(summary.tripCount)",
                    "Distance: \(String(format: "%.1f", summary.distanceKm)) km",
                    "Fuel: \(String(format: "%.2f", summary.fuelUsedL)) L",
                    "Avg: \(String(format: "%.1f", summary.avgL100)) L/100km",
                    "Cost: \(String(format: "%.2f", summary.estimatedCost))",
                    "Score: \(summary.avgScore.map { String(format: "%.0f", $0) } ?? "—")"
                ]
                for line in lines {
                    (line as NSString).draw(at: CGPoint(x: 40, y: y), withAttributes: [
                        .font: UIFont.systemFont(ofSize: 12)
                    ])
                    y += 22
                }
                ("QuickCar" as NSString).draw(
                    at: CGPoint(x: 40, y: 800),
                    withAttributes: [.font: UIFont.systemFont(ofSize: 10)]
                )
            }
            return url
        } catch {
            Log.error("PDF failed: \(error)")
            return nil
        }
    }
}
