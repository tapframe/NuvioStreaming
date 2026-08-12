import SwiftUI
import UIKit

struct SettingsView: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var addons: AddonStore
    @EnvironmentObject private var integrations: IntegrationStore
    @EnvironmentObject private var library: LibraryStore
    @EnvironmentObject private var profiles: TVProfileStore
    @EnvironmentObject private var homePreferences: HomePreferencesStore
    @EnvironmentObject private var watchProgress: WatchProgressStore
    @EnvironmentObject private var collections: CollectionStore
    @EnvironmentObject private var home: HomeStore
    @State private var cacheMessage: String?
    @State private var showLogout = false
    @FocusState private var focus: Action?

    enum Action: Hashable {
        case account, logout, clearCache, skipIntro, syncIntegrations
        case profile(Int), hero, catalogType, unreleased, homeItem(String, Int)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 30) {
                NuvioPageHeader(
                    title: "Settings",
                    subtitle: "Account, Home, playback integrations, and storage"
                )
                SettingsAccountSection(
                    auth: auth,
                    addons: addons,
                    profiles: profiles,
                    focus: $focus,
                    onSignOut: { showLogout = true }
                )
                SettingsHomeSection(
                    auth: auth,
                    profiles: profiles,
                    preferences: homePreferences,
                    focus: $focus
                )
                SettingsIntegrationsSection(
                    auth: auth,
                    addons: addons,
                    integrations: integrations,
                    focus: $focus
                )
                storageSection
            }
            .padding(48)
        }
        .defaultFocus($focus, auth.session == nil ? .account : .profile(profiles.activeProfileID))
        .confirmationDialog("Sign out of Nuvio?", isPresented: $showLogout, titleVisibility: .visible) {
            Button("Sign Out", role: .destructive) { Task { await signOut() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Account data and synchronized addons will be removed from this Apple TV.")
        }
    }

    private var storageSection: some View {
        NuvioPanel {
            VStack(alignment: .leading, spacing: 16) {
                Label("Storage", systemImage: "internaldrive")
                    .font(.title2.weight(.semibold))
                Text("Clear cached artwork and addon responses. Your library and addon list stay saved.")
                    .foregroundStyle(.secondary)
                NuvioButton(title: "Clear Network Cache", symbol: "trash") {
                    URLCache.shared.removeAllCachedResponses()
                    cacheMessage = "Network cache cleared."
                }
                .frame(width: 310)
                .focused($focus, equals: .clearCache)
                if let cacheMessage {
                    NuvioStatusMessage(message: cacheMessage, symbol: "checkmark.circle.fill")
                }
                Divider()
                Label(
                    "Nuvio \(appVersion) on \(UIDevice.current.systemName) \(UIDevice.current.systemVersion)",
                    systemImage: "appletv.fill"
                )
                .font(.callout)
                .foregroundStyle(.secondary)
            }
        }
    }

    private var appVersion: String {
        let short = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        return "\(short) (\(build))"
    }

    private func signOut() async {
        addons.clearForLogout()
        library.clearForLogout()
        watchProgress.clearForLogout()
        collections.clearForLogout()
        home.clearForLogout()
        profiles.clear()
        integrations.clearForLogout()
        homePreferences.clearForLogout()
        PlaybackProgressStore().clearAll()
        await auth.logout()
    }
}
