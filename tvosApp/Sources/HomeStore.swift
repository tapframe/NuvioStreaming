import Foundation

@MainActor
final class HomeStore: ObservableObject {
    @Published private(set) var snapshot = HomeSnapshot()

    private let service: StremioService
    private let accountService: NuvioAccountService
    private let preferences: HomePreferencesStore
    private let progress: WatchProgressStore
    private let collections: CollectionStore
    private var cachedSections: [String: HomeCatalogSection] = [:]
    private var generation = 0

    init(
        service: StremioService = StremioService(),
        accountService: NuvioAccountService = NuvioAccountService(),
        preferences: HomePreferencesStore,
        progress: WatchProgressStore,
        collections: CollectionStore
    ) {
        self.service = service
        self.accountService = accountService
        self.preferences = preferences
        self.progress = progress
        self.collections = collections
    }

    func load(
        addons: [HomeAddon],
        auth: AuthStore,
        profileID: Int,
        force: Bool = false
    ) async {
        generation += 1
        let requestGeneration = generation
        snapshot.isLoading = true
        snapshot.message = nil

        if auth.session != nil {
            async let progressSync: Void = progress.sync(auth: auth, profileID: profileID)
            async let collectionSync: Void = collections.sync(auth: auth, profileID: profileID)
            async let settingsSync: Void = syncPreferences(auth: auth, profileID: profileID)
            _ = await (progressSync, collectionSync, settingsSync)
        }
        guard requestGeneration == generation else { return }

        let definitions = buildDefinitions(addons: addons)
        preferences.reconcile(definitions: definitions, collections: collections.collections)
        let active = definitions
            .filter { preferences.value.preference(for: $0.id)?.enabled != false }
            .sorted { first, second in
                let left = preferences.value.preference(for: first.id)?.order ?? Int.max
                let right = preferences.value.preference(for: second.id)?.order ?? Int.max
                return left < right
            }

        let hideUnreleasedContent = preferences.value.hideUnreleasedContent
        var sections = force ? [:] : cachedSections.filter { key, _ in active.contains { $0.id == key } }
        var failures = 0
        await withTaskGroup(of: (String, HomeCatalogSection?).self) { group in
            for definition in active where force || sections[definition.id] == nil {
                group.addTask { [service] in
                    do {
                        let result = try await service.catalog(
                            baseURL: definition.addonBaseURL,
                            type: definition.type,
                            id: definition.catalogID
                        ).map { $0.withMetadataBaseURL(definition.addonBaseURL) }
                        let items = HomeReleaseFilter.releasedItems(result, enabled: hideUnreleasedContent)
                        return (definition.id, HomeCatalogSection(definition: definition, items: items))
                    } catch {
                        let detail = AppLog.safeDescription(error)
                        AppLog.home.error("Catalog refresh failed key=\(definition.id, privacy: .private(mask: .hash)) detail=\(detail, privacy: .public)")
                        return (definition.id, nil)
                    }
                }
            }
            for await (key, section) in group {
                if let section, !section.items.isEmpty { sections[key] = section } else { failures += 1 }
            }
        }
        guard requestGeneration == generation else { return }

        let orderedSections = active.compactMap { sections[$0.id] }
        cachedSections = sections
        let collectionRows = collections.collections.filter { collection in
            preferences.value.preference(for: "collection_\(collection.id)")?.enabled != false
        }
        snapshot = HomeSnapshot(
            heroItems: makeHero(sections: orderedSections),
            sections: orderedSections,
            continueWatching: progress.continueWatching,
            upcoming: await buildUpcoming(from: progress.records),
            collections: collectionRows,
            isLoading: false,
            message: failures > 0 ? "Some Home sections could not be refreshed. Check the connection and retry." : collections.message,
            isOffline: failures > 0
        )
    }

    func clearForLogout() {
        generation += 1
        cachedSections = [:]
        snapshot = HomeSnapshot()
    }

    private func syncPreferences(auth: AuthStore, profileID: Int) async {
        do {
            let token = try await auth.validAccessToken()
            if let remote = try await accountService.homePreferences(accessToken: token, profileID: profileID),
               !remote.items.isEmpty {
                preferences.applyRemote(remote)
            }
        } catch {
            let detail = AppLog.safeDescription(error)
            AppLog.sync.error("Home preferences sync failed profile=\(profileID) detail=\(detail, privacy: .public)")
        }
    }

    private func buildDefinitions(addons: [HomeAddon]) -> [HomeCatalogDefinition] {
        addons.flatMap { addon in
            addon.manifest.catalogs
                .filter { catalog in !catalog.extra.contains(where: { $0.isRequired }) }
                .map { catalog in
                    HomeCatalogDefinition(
                        addonBaseURL: addon.baseURL,
                        addonID: addon.manifest.id,
                        addonName: addon.name,
                        type: catalog.type,
                        catalogID: catalog.id,
                        catalogName: catalog.name,
                        supportsPagination: catalog.extra.contains { $0.name.lowercased() == "skip" }
                    )
                }
        }
    }

    private func makeHero(sections: [HomeCatalogSection]) -> [MetaSummary] {
        guard preferences.value.heroEnabled else { return [] }
        var seen = Set<String>()
        return sections.flatMap(\.items)
            .filter { seen.insert("\($0.type):\($0.id)").inserted }
            .prefix(8)
            .map { $0 }
    }

    private func buildUpcoming(from records: [WatchProgressRecord]) async -> [ContinueWatchingCard] {
        var upcoming: [ContinueWatchingCard] = []
        for record in records.filter({ $0.contentType.lowercased() == "series" && $0.isCompleted }).prefix(12) {
            guard let summary = record.summary else { continue }
            let detail: MetaDetail
            do {
                detail = try await service.details(type: record.contentType, id: record.contentID)
            } catch {
                let errorDetail = AppLog.safeDescription(error)
                AppLog.home.error("Upcoming enrichment failed content=\(record.contentID, privacy: .private(mask: .hash)) detail=\(errorDetail, privacy: .public)")
                continue
            }
            guard let next = HomeUpcomingResolver.nextEpisode(after: record, videos: detail.videos) else { continue }
            upcoming.append(ContinueWatchingCard(
                id: "upcoming:\(record.contentID):\(next.id)",
                summary: summary,
                videoID: next.id,
                season: next.season,
                episode: next.episode,
                episodeTitle: next.name,
                episodeThumbnail: next.thumbnail,
                released: next.released,
                positionMilliseconds: 0,
                durationMilliseconds: 0,
                lastWatchedMilliseconds: record.lastWatched,
                isUpcoming: true
            ))
        }
        return upcoming.sorted { ($0.released ?? "") < ($1.released ?? "") }
    }
}
