import SwiftUI

struct CatalogView: View {
    let onSelect: (MetaSummary) -> Void

    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var addons: AddonStore
    @EnvironmentObject private var profiles: TVProfileStore
    @EnvironmentObject private var home: HomeStore
    @EnvironmentObject private var preferences: HomePreferencesStore
    @EnvironmentObject private var collections: CollectionStore
    @State private var loadedFolders: [String: [MetaSummary]] = [:]
    @State private var selectedFolderByCollection: [String: String] = [:]
    @FocusState private var retryFocused: Bool

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 42) {
                if let message = home.snapshot.message { statusBanner(message) }
                content
            }
            .padding(.bottom, 60)
        }
        .background(NuvioTheme.background)
        .task(id: reloadKey) { await reload() }
        .refreshable { await reload(force: true) }
    }

    @ViewBuilder
    private var content: some View {
        if home.snapshot.isLoading && !home.snapshot.hasContent {
            loadingState
        } else if !home.snapshot.hasContent {
            emptyState
        } else {
            if let hero = home.snapshot.heroItems.first {
                HomeHeroView(item: hero) {
                    onSelect(hero)
                }
            }
            if !home.snapshot.continueWatching.isEmpty {
                Text("Continue Watching")
                    .font(.title2.weight(.semibold))
                    .padding(.horizontal, 48)
                ProgressRail(
                    items: home.snapshot.continueWatching,
                    onSelect: { item in
                        onSelect(item.summary.routedTo(
                            videoID: item.videoID,
                            season: item.season,
                            episode: item.episode
                        ))
                    }
                )
            }
            if !home.snapshot.upcoming.isEmpty {
                Text("Upcoming")
                    .font(.title2.weight(.semibold))
                    .padding(.horizontal, 48)
                ProgressRail(
                    items: home.snapshot.upcoming,
                    onSelect: { item in
                        onSelect(item.summary.routedTo(
                            videoID: item.videoID,
                            season: item.season,
                            episode: item.episode
                        ))
                    }
                )
            }
            ForEach(home.snapshot.collections) { collection in
                collectionRail(collection)
            }
            ForEach(home.snapshot.sections) { section in
                CatalogRail(
                    title: sectionTitle(section),
                    subtitle: section.definition.addonName,
                    items: Array(section.items.prefix(18)),
                    onSelect: onSelect
                )
            }
        }
    }

    private var reloadKey: String {
        "\(profiles.activeProfileID):\(addons.homeAddons.map(\.baseURL).joined(separator: "|"))"
    }

    private func reload(force: Bool = false) async {
        await home.load(
            addons: addons.homeAddons,
            auth: auth,
            profileID: profiles.activeProfileID,
            force: force
        )
    }

    private func sectionTitle(_ section: HomeCatalogSection) -> String {
        let preference = preferences.value.preference(for: section.id)
        if let custom = preference?.customTitle.trimmedNonEmpty { return custom }
        return section.title
    }

    private func collectionRail(_ collection: TVCollection) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(collection.title.tvSafe).font(.title2.weight(.semibold)).padding(.horizontal, 48)
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 26) {
                    ForEach(collection.folders) { folder in
                        FolderButton(
                            folder: folder,
                            count: loadedFolders[folder.id]?.count
                        ) {
                            select(folder, in: collection)
                        }
                    }
                }
                .padding(.horizontal, 48)
                .padding(.vertical, 18)
            }
            if let selectedID = selectedFolderByCollection[collection.id] ?? collection.folders.first?.id,
               let folder = collection.folders.first(where: { $0.id == selectedID }),
               let items = loadedFolders[selectedID], !items.isEmpty {
                CatalogRail(
                    title: folder.title,
                    subtitle: collection.title,
                    items: items,
                    onSelect: onSelect
                )
            }
        }
    }

    private func select(_ folder: TVCollectionFolder, in collection: TVCollection) {
        selectedFolderByCollection[collection.id] = folder.id
        Task {
            loadedFolders[folder.id] = await collections.items(
                for: folder,
                addons: addons.homeAddons
            )
        }
    }

    private var loadingState: some View {
        VStack(spacing: 24) {
            ProgressView().controlSize(.large)
            Text("Loading your Home").font(.title2.weight(.semibold))
            Text("Synchronizing catalogs, progress, and collections")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 640)
    }

    private var emptyState: some View {
        VStack(spacing: 20) {
            Image(systemName: "rectangle.stack.badge.plus").font(.system(size: 72))
            Text("Your Home is ready for content").font(.largeTitle.weight(.bold))
            Text("Enable an addon with catalogs, or retry when your connection returns.")
                .font(.title3).foregroundStyle(.secondary)
            NuvioButton(title: "Retry", symbol: "arrow.clockwise") {
                Task { await reload(force: true) }
            }
            .focused($retryFocused)
        }
        .frame(maxWidth: .infinity, minHeight: 640)
        .defaultFocus($retryFocused, true)
    }

    private func statusBanner(_ message: String) -> some View {
        Label(message.tvSafe, systemImage: home.snapshot.isOffline ? "wifi.slash" : "exclamationmark.triangle.fill")
            .font(.headline)
            .padding(.horizontal, 22).padding(.vertical, 14)
            .background(.ultraThinMaterial, in: Capsule())
            .padding(.horizontal, 48).padding(.top, 30)
    }
}
