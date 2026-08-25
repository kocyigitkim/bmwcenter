import SwiftUI

struct DashboardWidgetGallery: View {
    @ObservedObject var viewModel: DashboardViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                ForEach(DashboardWidgetCategory.allCases, id: \.self) { category in
                    let kinds = DashboardWidgetKind.allCases.filter { $0.galleryCategory == category }
                    if !kinds.isEmpty {
                        Section(String(localized: String.LocalizationValue(category.titleKey), table: "Localizable")) {
                            ForEach(kinds) { kind in
                                galleryRow(kind)
                            }
                        }
                    }
                }
            }
            .navigationTitle(String(localized: "dashboard.gallery", table: "Localizable"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "action.done", table: "Localizable")) {
                        dismiss()
                    }
                    .frame(minWidth: DSSpace.minTouch, minHeight: DSSpace.minTouch)
                }
            }
        }
    }

    private func galleryRow(_ kind: DashboardWidgetKind) -> some View {
        let placed = viewModel.placedKinds.contains(kind)
        return Button {
            guard !placed else { return }
            viewModel.add(kind)
            dismiss()
        } label: {
            HStack(spacing: DSSpace.s3) {
                Image(systemName: kind.systemImage)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Color.brandPrimary)
                    .frame(width: 28, alignment: .center)
                    .accessibilityHidden(true)
                Text(String(localized: String.LocalizationValue(kind.titleKey), table: "Localizable"))
                    .foregroundStyle(Color.contentPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if placed {
                    Text(String(localized: "dashboard.added", table: "Localizable"))
                        .font(DSFont.caption())
                        .foregroundStyle(Color.contentTertiary)
                } else {
                    Image(systemName: "plus.circle.fill")
                        .foregroundStyle(Color.brandPrimary)
                        .font(.system(size: 22))
                        .accessibilityHidden(true)
                }
            }
            .frame(minHeight: DSSpace.minTouch)
            .contentShape(Rectangle())
        }
        .disabled(placed)
        .accessibilityLabel(galleryA11y(kind, placed: placed))
        .accessibilityAddTraits(placed ? .isStaticText : .isButton)
    }

    private func galleryA11y(_ kind: DashboardWidgetKind, placed: Bool) -> String {
        let title = String(localized: String.LocalizationValue(kind.titleKey), table: "Localizable")
        if placed {
            return "\(title), \(String(localized: "dashboard.added", table: "Localizable"))"
        }
        return title
    }
}
