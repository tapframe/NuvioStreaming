import SwiftUI

struct NuvioButton: View {
    let title: String
    let symbol: String
    var prominent = false
    var destructive = false
    var disabled = false
    let action: () -> Void

    var body: some View {
        Group {
            if destructive {
                Button(role: .destructive, action: action) { label }
                    .buttonStyle(.bordered)
            } else if prominent {
                Button(action: action) { label }
                    .buttonStyle(.borderedProminent)
            } else {
                Button(action: action) { label }
                    .buttonStyle(.bordered)
            }
        }
        .controlSize(.large)
        .disabled(disabled)
    }

    private var label: some View {
        Label(title.tvSafe, systemImage: symbol)
            .font(.headline)
            .frame(maxWidth: .infinity)
    }
}

struct NuvioPanel<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        content
            .padding(28)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

struct NuvioPageHeader: View {
    let title: String
    var subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.tvSafe)
                .font(.largeTitle.weight(.bold))
            if let subtitle {
                Text(subtitle.tvSafe)
                    .font(.headline)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

struct NuvioUnavailableView: View {
    let title: String
    let symbol: String
    let message: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        ContentUnavailableView {
            Label(title.tvSafe, systemImage: symbol)
        } description: {
            Text(message.tvSafe)
        } actions: {
            if let actionTitle, let action {
                Button(actionTitle.tvSafe, action: action)
                    .buttonStyle(.borderedProminent)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 420)
    }
}

struct NuvioStatusMessage: View {
    let message: String
    var symbol = "info.circle.fill"
    var tint: Color = .secondary

    var body: some View {
        Label(message.tvSafe, systemImage: symbol)
            .font(.callout.weight(.semibold))
            .foregroundStyle(tint)
            .accessibilityElement(children: .combine)
    }
}
