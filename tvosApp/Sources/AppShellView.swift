import SwiftUI

struct AppShellView: View {
    @EnvironmentObject private var authStore: AuthStore
    @EnvironmentObject private var addonStore: AddonStore
    @EnvironmentObject private var integrationStore: IntegrationStore
    @EnvironmentObject private var libraryStore: LibraryStore
    @EnvironmentObject private var profileStore: TVProfileStore
    @State private var selection: AppSection = .home
    @State private var path: [MetaSummary] = []

    var body: some View {
        NavigationStack(path: $path) {
            TabView(selection: $selection) {
                Tab("Home", systemImage: "house", value: .home) {
                    CatalogView(onSelect: showDetails)
                }
                Tab("Search", systemImage: "magnifyingglass", value: .search, role: .search) {
                    SearchView(onSelect: showDetails)
                }
                Tab("Library", systemImage: "rectangle.stack", value: .library) {
                    LibraryView(onSelect: showDetails)
                }
                Tab("Addons", systemImage: "puzzlepiece.extension", value: .addons) {
                    AddonsView()
                }
                Tab("Settings", systemImage: "gearshape", value: .settings) {
                    SettingsView()
                }
            }
            .tabViewStyle(.sidebarAdaptable)
            .background(NuvioTheme.background.ignoresSafeArea())
            .navigationDestination(for: MetaSummary.self) { summary in
                DetailsView(summary: summary)
            }
        }
        .task(id: authStore.signedInEmail) { await synchronizeAccount() }
    }

    private func showDetails(_ summary: MetaSummary) {
        path.append(summary)
    }

    private func synchronizeAccount() async {
        guard authStore.session != nil else {
            await addonStore.refreshManifests()
            return
        }
        await profileStore.sync(auth: authStore)
        let profileID = profileStore.activeProfileID
        let addonProfileID = profileStore.activeProfile?.usesPrimaryAddons == true ? 1 : profileID
        async let addons: Void = addonStore.syncFromAccount(auth: authStore, profileID: addonProfileID)
        async let integrations: Void = integrationStore.syncFromAccount(auth: authStore)
        async let library: Void = libraryStore.syncFromAccount(auth: authStore, profileID: profileID)
        _ = await (addons, integrations, library)
    }
}

enum AppSection: String, Hashable {
    case home, search, library, addons, settings
}
