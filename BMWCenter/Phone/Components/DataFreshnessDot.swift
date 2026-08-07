import SwiftUI

struct DataFreshnessDot: View {
    let freshness: DataFreshness

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 6, height: 6)
            .accessibilityLabel(freshness.accessibilityLabel)
    }

    private var color: Color {
        switch freshness {
        case .live: .semNominal
        case .stale: .semAttention
        case .unavailable, .disconnected, .error: .semInactive
        }
    }
}
