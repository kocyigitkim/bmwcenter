import SwiftUI

struct SectionCard<Content: View>: View {
    let title: String?
    @ViewBuilder var content: () -> Content

    init(_ title: String? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: DSSpace.s3) {
            if let title {
                Text(title)
                    .font(DSFont.title())
                    .foregroundStyle(Color.contentPrimary)
            }
            content()
        }
        .padding(DSSpace.cardPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .opaqueSurface()
    }
}
