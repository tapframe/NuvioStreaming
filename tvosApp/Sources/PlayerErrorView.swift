import SwiftUI

struct PlayerErrorView: View {
    let message: String
    let onClose: () -> Void

    var body: some View {
        NuvioPanel {
            VStack(spacing: 20) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.largeTitle)
                    .foregroundStyle(.orange)
                    .accessibilityHidden(true)
                Text("Playback Error").font(.title.weight(.bold))
                Text(message.tvSafe)
                    .font(.title3)
                    .multilineTextAlignment(.center)
                Button("Close", action: onClose)
                    .buttonStyle(.borderedProminent)
            }
            .frame(maxWidth: 680)
        }
        .accessibilityElement(children: .contain)
    }
}
