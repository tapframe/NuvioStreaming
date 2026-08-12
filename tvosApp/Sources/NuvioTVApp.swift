import SwiftUI

@main
struct NuvioTVApp: App {
    @StateObject private var authStore = AuthStore()
    @StateObject private var addonStore = AddonStore()
    @StateObject private var integrationStore: IntegrationStore
    @StateObject private var libraryStore: LibraryStore
    @StateObject private var profileStore: TVProfileStore
    @StateObject private var homePreferences: HomePreferencesStore
    @StateObject private var watchProgressStore: WatchProgressStore
    @StateObject private var collectionStore: CollectionStore
    @StateObject private var homeStore: HomeStore

    init() {
        let preferences = HomePreferencesStore()
        let progress = WatchProgressStore()
        let collections = CollectionStore()
        _authStore = StateObject(wrappedValue: AuthStore())
        _addonStore = StateObject(wrappedValue: AddonStore())
        _integrationStore = StateObject(wrappedValue: IntegrationStore())
        _libraryStore = StateObject(wrappedValue: LibraryStore())
        _profileStore = StateObject(wrappedValue: TVProfileStore())
        _homePreferences = StateObject(wrappedValue: preferences)
        _watchProgressStore = StateObject(wrappedValue: progress)
        _collectionStore = StateObject(wrappedValue: collections)
        _homeStore = StateObject(wrappedValue: HomeStore(
            preferences: preferences,
            progress: progress,
            collections: collections
        ))
    }

    var body: some Scene {
        WindowGroup {
            AccountGateView()
                .environmentObject(authStore)
                .environmentObject(addonStore)
                .environmentObject(integrationStore)
                .environmentObject(libraryStore)
                .environmentObject(profileStore)
                .environmentObject(homePreferences)
                .environmentObject(watchProgressStore)
                .environmentObject(collectionStore)
                .environmentObject(homeStore)
                .preferredColorScheme(.dark)
        }
    }
}

enum NuvioTheme {
    static let background = Color(red: 0.035, green: 0.035, blue: 0.045)
    static let panel = Color.white.opacity(0.075)
    static let panelFocused = Color.white.opacity(0.20)
    static let secondaryText = Color.white.opacity(0.68)
}

extension String {
    var tvSafe: String {
        replacingOccurrences(of: "\u{0026}", with: "and")
            .replacingOccurrences(of: "\u{2014}", with: "-")
            .replacingOccurrences(of: "\u{2013}", with: "-")
    }
}
