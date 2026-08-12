import SwiftUI

struct SettingsIntegrationsSection: View {
    @ObservedObject var auth: AuthStore
    @ObservedObject var addons: AddonStore
    @ObservedObject var integrations: IntegrationStore
    var focus: FocusState<SettingsView.Action?>.Binding

    var body: some View {
        NuvioPanel {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    Label("Playback Integrations", systemImage: "sparkles.tv")
                        .font(.title2.weight(.semibold))
                    Spacer()
                    if integrations.isSyncing { ProgressView() }
                }
                integrationRow(
                    title: "AniSkip",
                    detail: "Community anime openings, endings, and recaps",
                    symbol: "forward.end.circle.fill",
                    status: integrations.settings.skipIntroEnabled ? "Active" : "Disabled"
                )
                integrationRow(
                    title: "Anime Skip",
                    detail: "Synchronized from your mobile playback settings",
                    symbol: "sparkles.tv.fill",
                    status: integrations.settings.animeSkipReady ? "Connected" : "Set up on mobile"
                )
                integrationRow(
                    title: "Stremio Addons",
                    detail: "Catalogs, metadata, streams, and source headers",
                    symbol: "puzzlepiece.extension.fill",
                    status: "\(addons.addons.count) enabled"
                )
                Toggle("Show skip controls during playback", isOn: Binding(
                    get: { integrations.settings.skipIntroEnabled },
                    set: integrations.setSkipIntroEnabled
                ))
                .focused(focus, equals: .skipIntro)
                if auth.session != nil {
                    NuvioButton(
                        title: "Sync Mobile Integrations",
                        symbol: "arrow.triangle.2.circlepath"
                    ) {
                        Task { await integrations.syncFromAccount(auth: auth) }
                    }
                    .frame(width: 360)
                    .focused(focus, equals: .syncIntegrations)
                }
                if let message = integrations.syncMessage {
                    NuvioStatusMessage(message: message, symbol: "arrow.triangle.2.circlepath")
                }
            }
        }
    }

    private func integrationRow(
        title: String,
        detail: String,
        symbol: String,
        status: String
    ) -> some View {
        HStack(spacing: 18) {
            Image(systemName: symbol)
                .font(.title2)
                .foregroundStyle(.secondary)
                .frame(width: 42)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.headline)
                Text(detail).font(.callout).foregroundStyle(.secondary)
            }
            Spacer()
            Text(status)
                .font(.callout.weight(.semibold))
                .foregroundStyle(.white.opacity(0.82))
        }
    }
}