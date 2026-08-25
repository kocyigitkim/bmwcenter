import SwiftUI
import Charts

struct SparklineChart: View {
    let values: [Double]
    var tint: Color = .brandPrimary

    var body: some View {
        Chart {
            ForEach(Array(values.enumerated()), id: \.offset) { index, value in
                LineMark(
                    x: .value("t", index),
                    y: .value("v", value)
                )
                .interpolationMethod(.catmullRom)
                .foregroundStyle(tint)
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .frame(height: 56)
    }
}
