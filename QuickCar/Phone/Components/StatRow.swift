import SwiftUI

struct StatRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack {
            Text(title)
                .font(DSFont.label())
                .foregroundStyle(Color.contentSecondary)
            Spacer()
            Text(value)
                .font(DSFont.label())
                .dsMetricDigit()
                .foregroundStyle(Color.contentPrimary)
        }
        .padding(.vertical, 4)
    }
}
