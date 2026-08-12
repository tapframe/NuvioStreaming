import XCTest
@testable import NuvioTV

final class StremioServiceTests: XCTestCase {
    func testManifestURLNormalization() throws {
        let base = try StremioService.normalizeManifestURL(
            " https://example.com/config/user/manifest.json?token=ignored "
        )
        XCTAssertEqual(base.absoluteString, "https://example.com/config/user?token=ignored")
    }

    func testBaseURLNormalization() throws {
        let base = try StremioService.normalizeManifestURL("https://example.com/addon/")
        XCTAssertEqual(base.absoluteString, "https://example.com/addon")
    }

    func testBaseURLNormalizationPreservesQueryCredentials() throws {
        let base = try StremioService.normalizeManifestURL("https://example.com/addon/manifest.json?token=secret")
        XCTAssertEqual(base.absoluteString, "https://example.com/addon?token=secret")
    }

    func testAddonTransportBuildsCatalogURLAndPreservesQuery() throws {
        let url = try AddonTransport.catalogURL(
            baseURL: "https://example.com/config/user?token=secret",
            type: "movie",
            id: "top picks",
            genre: "Science Fiction"
        )
        XCTAssertEqual(
            url.absoluteString,
            "https://example.com/config/user/catalog/movie/top%20picks/genre=Science%20Fiction.json?token=secret"
        )
    }

    func testCatalogFixtureToleratesMissingAndMixedFields() throws {
        let fixture = #"""
        {
          "metas": [
            {"id": 42, "name": "Example", "type": "movie", "releaseInfo": 2026, "genre": "Drama"},
            {"id": "tt2", "name": "Second", "type": "series"},
            "malformed entry"
          ]
        }
        """#.data(using: .utf8)!

        let response = try JSONDecoder().decode(CatalogResponse.self, from: fixture)
        XCTAssertEqual(response.metas.count, 2)
        XCTAssertEqual(response.metas[0].id, "42")
        XCTAssertEqual(response.metas[0].releaseInfo, "2026")
        XCTAssertEqual(response.metas[0].genres, ["Drama"])
        XCTAssertEqual(response.metas[1].type, "series")
    }

    func testCatalogFixtureDropsItemsMissingRequiredIdentity() throws {
        let fixture = #"""
        {"metas":[
          {"id":"tt1","name":"Complete","type":"movie"},
          {"name":"Missing id","type":"movie"},
          {"id":"tt2","type":"movie"},
          {"id":"tt3","name":"Missing type"}
        ]}
        """#.data(using: .utf8)!

        let response = try JSONDecoder().decode(CatalogResponse.self, from: fixture)
        XCTAssertEqual(response.metas.map(\.id), ["tt1"])
    }

    func testCollectionFixtureUsesMobileDefaultsAndLegacyCatalogSources() throws {
        let fixture = #"""
        [{
          "profile_id": 1,
          "collections_json": [{
            "id": "favorites", "title": "Favorites",
            "folders": [{
              "id": "movies", "title": "Movies",
              "catalogSources": [{"addonId":"cinemeta","type":"movie","catalogId":"top"}]
            }]
          }]
        }]
        """#.data(using: .utf8)!
        let rows = try JSONDecoder().decode([CollectionSyncBlob].self, from: fixture)
        let collection = try XCTUnwrap(rows.first?.collections.first)
        XCTAssertFalse(collection.pinToTop)
        let folder = try XCTUnwrap(collection.folders.first)
        XCTAssertEqual(folder.tileShape, "poster")
        XCTAssertFalse(folder.hideTitle)
        XCTAssertEqual(folder.sources.first?.provider, "addon")
        XCTAssertEqual(folder.sources.first?.catalogId, "top")
    }

    func testCollectionFixtureAcceptsStringTraktListID() throws {
        let fixture = #"""
        [{"collections_json":[{"id":"lists","title":"Lists","folders":[{
          "id":"trakt","title":"Trakt","sources":[{"provider":"trakt","traktListId":"12345"}]
        }]}]}]
        """#.data(using: .utf8)!
        let rows = try JSONDecoder().decode([CollectionSyncBlob].self, from: fixture)
        XCTAssertEqual(rows.first?.collections.first?.folders.first?.sources.first?.traktListId, 12345)
    }

    func testCollectionNullPayloadDecodesAsEmpty() throws {
        let fixture = #"""[{"collections_json":null}]"""#.data(using: .utf8)!
        let rows = try JSONDecoder().decode([CollectionSyncBlob].self, from: fixture)
        XCTAssertEqual(rows.first?.collections, [])
    }

    func testProgressKeyMatchesSharedFallback() {
        XCTAssertEqual(
            WatchProgressRecord.key(contentID: "tt-series", videoID: "special-video", season: nil, episode: nil),
            "tt-series"
        )
        XCTAssertEqual(
            WatchProgressRecord.key(contentID: "tt-series", videoID: "episode", season: 2, episode: 3),
            "tt-series_s2e3"
        )
    }

    func testHomeSettingsFixtureUsesSharedDefaults() throws {
        let fixture = #"""
        [{"settings_json":{"items":[{"addon_id":"a","type":"movie","catalog_id":"top"}]}}]
        """#.data(using: .utf8)!
        let rows = try JSONDecoder().decode([HomeCatalogSyncBlob].self, from: fixture)
        let settings = try XCTUnwrap(rows.first?.settingsJSON)
        XCTAssertTrue(settings.showCatalogType)
        XCTAssertFalse(settings.hideUnreleasedContent)
        XCTAssertTrue(settings.items.first?.enabled ?? false)
        XCTAssertEqual(settings.items.first?.order, 0)
        XCTAssertEqual(settings.items.first?.customTitle, "")
    }

    func testProfileFixtureUsesMobileDefaults() throws {
        let fixture = #"""
        [{"profile_index":2,"name":"Kids"}]
        """#.data(using: .utf8)!
        let profiles = try JSONDecoder().decode([TVProfile].self, from: fixture)
        XCTAssertEqual(profiles.first?.id, "")
        XCTAssertEqual(profiles.first?.avatarColorHex, "#1E88E5")
        XCTAssertFalse(profiles.first?.usesPrimaryAddons ?? true)
    }

    func testManifestDecodesHomeEligibilityFields() throws {
        let fixture = #"""
        {
          "id": "addon.test", "name": "Test", "types": ["movie"],
          "resources": [{"name":"catalog","types":["movie"],"idPrefixes":["tt"]}],
          "catalogs": [{"type":"movie","id":"top","name":"Top","extra":[{"name":"skip","isRequired":false}]}]
        }
        """#.data(using: .utf8)!
        let manifest = try JSONDecoder().decode(AddonManifest.self, from: fixture)
        XCTAssertEqual(manifest.types, ["movie"])
        XCTAssertEqual(manifest.resources.first?.types, ["movie"])
        XCTAssertEqual(manifest.catalogs.first?.extra.first?.name, "skip")
        XCTAssertFalse(manifest.catalogs.first?.extra.first?.isRequired ?? true)
    }

    func testReleaseFilterRemovesFutureDateAndYear() {
        let now = ISO8601DateFormatter().date(from: "2026-08-11T12:00:00Z")!
        let items = [
            MetaSummary(id: "a", type: "movie", name: "Released", releaseInfo: "2025"),
            MetaSummary(id: "b", type: "movie", name: "Future year", releaseInfo: "2027"),
            MetaSummary(id: "c", type: "movie", name: "Future date", released: "2026-12-01")
        ]
        XCTAssertEqual(HomeReleaseFilter.releasedItems(items, enabled: true, now: now).map(\.id), ["a"])
    }

    func testUpcomingResolverChoosesNextEpisodeAcrossSeasonBoundary() {
        let fixture = #"""
        {"meta":{"id":"tt1","type":"series","name":"Show","videos":[
          {"id":"tt1:1:2","name":"Two","season":1,"episode":2},
          {"id":"tt1:2:1","name":"New Season","season":2,"episode":1}
        ]}}
        """#.data(using: .utf8)!
        let detail = try! JSONDecoder().decode(MetaResponse.self, from: fixture).meta
        let record = WatchProgressRecord(
            contentID: "tt1", contentType: "series", videoID: "tt1:1:2", season: 1, episode: 2,
            position: 900, duration: 1_000, lastWatched: 1, progressKey: "tt1_s1e2",
            summary: detail.summary, episodeTitle: nil, episodeThumbnail: nil
        )
        XCTAssertEqual(HomeUpcomingResolver.nextEpisode(after: record, videos: detail.videos)?.id, "tt1:2:1")
    }

    func testSearchPathPercentEncoding() throws {
        let url = try StremioService.catalogURL(
            type: "movie",
            id: "top",
            query: "The Matrix \u{0026} Neo/Trinity"
        )
        XCTAssertEqual(
            url.absoluteString,
            "https://v3-cinemeta.strem.io/catalog/movie/top/search=The%20Matrix%20%26%20Neo%2FTrinity.json"
        )
    }

    func testSearchCatalogRequestsUseEveryCompatibleAddonCatalog() throws {
        let first = try manifest(from: #"""
        {
          "id":"one", "name":"One",
          "catalogs":[
            {"type":"movie","id":"searchable","name":"Movies","extra":[{"name":"search","isRequired":true}]},
            {"type":"series","id":"browse","name":"Series","extra":[{"name":"skip"}]}
          ]
        }
        """#)
        let second = try manifest(from: #"""
        {
          "id":"two", "name":"Two",
          "catalogs":[
            {"type":"series","id":"lookup","name":"Shows","extra":[{"name":"search"}]},
            {"type":"movie","id":"blocked","name":"Blocked","extra":[
              {"name":"search"},{"name":"token","isRequired":true}
            ]}
          ]
        }
        """#)
        let requests = SearchCatalogRequest.compatibleRequests(from: [
            HomeAddon(baseURL: "https://one.example", name: "One", manifest: first),
            HomeAddon(baseURL: "https://two.example", name: "Two", manifest: second),
        ])

        XCTAssertEqual(requests, [
            SearchCatalogRequest(baseURL: "https://one.example", addonName: "One", type: "movie", catalogID: "searchable"),
            SearchCatalogRequest(baseURL: "https://two.example", addonName: "Two", type: "series", catalogID: "lookup"),
        ])
    }

    func testSearchCatalogRequestsFallBackToCinemetaWithoutCompatibleCatalogs() {
        let requests = SearchCatalogRequest.compatibleRequests(from: [])

        XCTAssertEqual(requests.map(\.addonName), ["Cinemeta", "Cinemeta"])
        XCTAssertEqual(requests.map(\.type), ["movie", "series"])
        XCTAssertEqual(requests.map(\.catalogID), ["top", "top"])
    }

    func testBrowseCatalogRequestsIncludeCompatibleCatalogsAndResolveRequiredGenre() throws {
        let addon = try manifest(from: #"""
        {
          "id":"browse", "name":"Browse",
          "catalogs":[
            {"type":"movie","id":"popular","name":"Popular","extra":[{"name":"skip"}]},
            {"type":"series","id":"genre","name":"By Genre","extra":[{"name":"genre","isRequired":true,"options":["Drama","Comedy"]}]},
            {"type":"movie","id":"search-only","name":"Search","extra":[{"name":"search","isRequired":true}]},
            {"type":"movie","id":"token","name":"Token","extra":[{"name":"token","isRequired":true}]}
          ]
        }
        """#)

        let requests = BrowseCatalogRequest.compatibleRequests(from: [
            HomeAddon(baseURL: "https://browse.example", name: "Browse", manifest: addon),
        ])

        XCTAssertEqual(requests, [
            BrowseCatalogRequest(baseURL: "https://browse.example", addonName: "Browse", type: "movie", catalogID: "popular", catalogName: "Popular", genre: nil),
            BrowseCatalogRequest(baseURL: "https://browse.example", addonName: "Browse", type: "series", catalogID: "genre", catalogName: "By Genre", genre: "Drama"),
        ])
    }

    @MainActor
    func testContinueWatchingKeepsLatestEpisodeForEachShow() {
        let defaults = isolatedDefaults()
        let store = WatchProgressStore(defaults: defaults)
        let show = MetaSummary(id: "tt-show", type: "series", name: "Show")
        let film = MetaSummary(id: "tt-film", type: "movie", name: "Film")

        store.record(summary: show, videoID: "tt-show:1:1", season: 1, episode: 1, episodeTitle: "One", episodeThumbnail: nil, positionSeconds: 50, durationSeconds: 1_000)
        store.record(summary: show, videoID: "tt-show:1:4", season: 1, episode: 4, episodeTitle: "Four", episodeThumbnail: nil, positionSeconds: 80, durationSeconds: 1_000)
        store.record(summary: film, videoID: "tt-film", season: nil, episode: nil, episodeTitle: nil, episodeThumbnail: nil, positionSeconds: 90, durationSeconds: 1_000)

        let cards = store.continueWatching
        XCTAssertEqual(cards.count, 2)
        XCTAssertEqual(cards.first(where: { $0.summary.id == "tt-show" })?.episode, 4)
        XCTAssertEqual(store.latestResumableRecord(contentID: "tt-show")?.videoID, "tt-show:1:4")
    }

    func testShellUsesNativeAdaptiveTabs() throws {
        let shell = try source(named: "AppShellView.swift")
        XCTAssertTrue(shell.contains("TabView(selection:"))
        XCTAssertTrue(shell.contains(".tabViewStyle(.sidebarAdaptable)"))
        XCTAssertTrue(shell.contains("role: .search"))
        XCTAssertFalse(shell.contains(".onMoveCommand"))
        XCTAssertFalse(shell.contains("sidebarColor"))
    }

    func testPlaybackProgressResumeRules() {
        XCTAssertNil(PlaybackProgress(position: 10, duration: 100, updatedAt: Date()).resumablePosition)
        XCTAssertEqual(
            PlaybackProgress(position: 25, duration: 100, updatedAt: Date()).resumablePosition,
            25
        )
        XCTAssertNil(PlaybackProgress(position: 95, duration: 100, updatedAt: Date()).resumablePosition)
    }

    func testPlayerTimeFormatter() {
        XCTAssertEqual(PlayerTimeFormatter.string(65), "01:05")
        XCTAssertEqual(PlayerTimeFormatter.string(3_661), "1:01:01")
    }

    func testStreamDecodesProxyRequestHeaders() throws {
        let fixture = #"""
        {
          "name": "Protected source",
          "url": "https://video.example/movie.m3u8",
          "behaviorHints": {
            "proxyHeaders": {
              "request": {"Referer": "https://example.com", "X-Token": "secret"}
            }
          }
        }
        """#.data(using: .utf8)!

        let stream = try JSONDecoder().decode(StremioStream.self, from: fixture)
        XCTAssertEqual(stream.requestHeaders["Referer"], "https://example.com")
        XCTAssertEqual(stream.requestHeaders["X-Token"], "secret")
    }

    func testStreamDecodesProxyResponseHeadersSeparately() throws {
        let fixture = #"""
        {
          "name": "Protected source",
          "url": "https://video.example/movie.m3u8",
          "behaviorHints": {
            "proxyHeaders": {
              "request": {"Referer": "https://example.com"},
              "response": {"Content-Type": "application/vnd.apple.mpegurl"}
            }
          }
        }
        """#.data(using: .utf8)!

        let stream = try JSONDecoder().decode(StremioStream.self, from: fixture)
        XCTAssertEqual(stream.requestHeaders["Referer"], "https://example.com")
        XCTAssertEqual(stream.responseHeaders["Content-Type"], "application/vnd.apple.mpegurl")
        XCTAssertNil(stream.requestHeaders["Content-Type"])
    }

    func testManifestMetaEligibilityRespectsTypesAndIDPrefixes() throws {
        let fixture = #"""
        {"id":"addon.test","name":"Test","resources":[
          {"name":"meta","types":["movie"],"idPrefixes":["tt"]},
          {"name":"stream","types":["series"],"idPrefixes":["tt"]}
        ]}
        """#.data(using: .utf8)!
        let manifest = try JSONDecoder().decode(AddonManifest.self, from: fixture)
        XCTAssertTrue(StremioService.manifestProvidesMeta(manifest, type: "movie", id: "tt123"))
        XCTAssertFalse(StremioService.manifestProvidesMeta(manifest, type: "series", id: "tt123"))
        XCTAssertFalse(StremioService.manifestProvidesMeta(manifest, type: "movie", id: "kitsu:1"))
    }

    @MainActor
    func testWatchProgressResumeRequiresExactVideoAndContent() {
        let suiteName = "WatchProgressStoreTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let store = WatchProgressStore(defaults: defaults, accountService: NuvioAccountService())
        let summary = MetaSummary(id: "tt-series", type: "series", name: "Series")
        store.record(
            summary: summary,
            videoID: "tt-series:1:1",
            season: 1,
            episode: 1,
            episodeTitle: "One",
            episodeThumbnail: nil,
            positionSeconds: 120,
            durationSeconds: 600
        )

        XCTAssertEqual(store.resumablePosition(videoID: "tt-series:1:1", contentID: "tt-series"), 120)
        XCTAssertNil(store.resumablePosition(videoID: "tt-series:1:2", contentID: "tt-series"))
        XCTAssertNil(store.resumablePosition(videoID: "tt-series:1:1", contentID: "other-series"))
    }

    private func isolatedDefaults() -> UserDefaults {
        let suite = "NuvioTVTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    private func manifest(from fixture: String) throws -> AddonManifest {
        try JSONDecoder().decode(AddonManifest.self, from: Data(fixture.utf8))
    }

    private func source(named name: String) throws -> String {
        let tests = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let url = tests.deletingLastPathComponent().appendingPathComponent("Sources/\(name)")
        return try String(contentsOf: url, encoding: .utf8)
    }
}
