import Foundation

struct HomeCatalogDefinition: Hashable, Identifiable {
    let addonBaseURL: String
    let addonID: String
    let addonName: String
    let type: String
    let catalogID: String
    let catalogName: String
    let supportsPagination: Bool

    var id: String { "\(addonID):\(type):\(catalogID)" }
    var defaultTitle: String { "\(catalogName) - \(type.capitalized)" }
}

struct HomeCatalogSection: Identifiable, Equatable {
    let definition: HomeCatalogDefinition
    let items: [MetaSummary]
    var id: String { definition.id }
    var title: String { definition.catalogName }
}

struct HomeCatalogPreference: Codable, Equatable {
    let key: String
    var enabled: Bool
    var order: Int
    var customTitle: String
}

struct HomePreferences: Codable, Equatable {
    var heroEnabled = true
    var showCatalogType = true
    var hideUnreleasedContent = false
    var items: [HomeCatalogPreference] = []

    var syncJSONObject: [String: Any] {
        [
            "show_catalog_type": showCatalogType,
            "hide_unreleased_content": hideUnreleasedContent,
            "items": items.map { item in
                [
                    "addon_id": item.key.split(separator: ":").first.map(String.init) ?? "",
                    "type": item.key.split(separator: ":").dropFirst().first.map(String.init) ?? "",
                    "catalog_id": item.key.split(separator: ":").dropFirst(2).first.map(String.init) ?? "",
                    "enabled": item.enabled,
                    "order": item.order,
                    "custom_title": item.customTitle,
                    "is_collection": item.key.hasPrefix("collection_"),
                    "collection_id": item.key.hasPrefix("collection_") ? String(item.key.dropFirst("collection_".count)) : "",
                    "key": item.key,
                ] as [String: Any]
            },
        ]
    }

    func preference(for key: String) -> HomeCatalogPreference? {
        items.first { $0.key == key }
    }
}

struct HomeSnapshot: Equatable {
    var heroItems: [MetaSummary] = []
    var sections: [HomeCatalogSection] = []
    var continueWatching: [ContinueWatchingCard] = []
    var upcoming: [ContinueWatchingCard] = []
    var collections: [TVCollection] = []
    var isLoading = false
    var message: String?
    var isOffline = false

    var hasContent: Bool {
        !heroItems.isEmpty || !sections.isEmpty || !continueWatching.isEmpty ||
            !upcoming.isEmpty || collections.contains { !$0.folders.isEmpty }
    }
}

struct ContinueWatchingCard: Identifiable, Equatable {
    let id: String
    let summary: MetaSummary
    let videoID: String
    let season: Int?
    let episode: Int?
    let episodeTitle: String?
    let episodeThumbnail: String?
    let released: String?
    let positionMilliseconds: Int64
    let durationMilliseconds: Int64
    let lastWatchedMilliseconds: Int64
    let isUpcoming: Bool

    var progress: Double {
        guard durationMilliseconds > 0 else { return 0 }
        return min(max(Double(positionMilliseconds) / Double(durationMilliseconds), 0), 1)
    }
}

struct TVCollection: Decodable, Equatable, Identifiable {
    let id: String
    let title: String
    let backdropImageUrl: String?
    let pinToTop: Bool
    let folders: [TVCollectionFolder]

    private enum CodingKeys: String, CodingKey {
        case id, title, backdropImageUrl, pinToTop, folders
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        title = try values.decodeIfPresent(String.self, forKey: .title) ?? "Collection"
        backdropImageUrl = try values.decodeIfPresent(String.self, forKey: .backdropImageUrl)
        pinToTop = try values.decodeIfPresent(Bool.self, forKey: .pinToTop) ?? false
        folders = try values.decodeIfPresent([TVCollectionFolder].self, forKey: .folders) ?? []
    }
}

struct TVCollectionFolder: Decodable, Equatable, Identifiable {
    let id: String
    let title: String
    let coverImageUrl: String?
    let tileShape: String
    let hideTitle: Bool
    let sources: [TVCollectionSource]

    private enum CodingKeys: String, CodingKey {
        case id, title, coverImageUrl, tileShape, hideTitle, sources, catalogSources
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        title = try values.decodeIfPresent(String.self, forKey: .title) ?? "Folder"
        coverImageUrl = try values.decodeIfPresent(String.self, forKey: .coverImageUrl)
        tileShape = try values.decodeIfPresent(String.self, forKey: .tileShape) ?? "poster"
        hideTitle = try values.decodeIfPresent(Bool.self, forKey: .hideTitle) ?? false
        sources = try values.decodeIfPresent([TVCollectionSource].self, forKey: .sources)
            ?? values.decodeIfPresent([TVCollectionSource].self, forKey: .catalogSources)
            ?? []
    }
}

struct TVCollectionSource: Decodable, Equatable {
    let provider: String
    let addonId: String?
    let type: String?
    let catalogId: String?
    let genre: String?
    let title: String?
    let tmdbSourceType: String?
    let tmdbId: Int?
    let traktListId: Int64?
    let mediaType: String?
    let sortBy: String?
    let sortHow: String?

    private enum CodingKeys: String, CodingKey {
        case provider, addonId, type, catalogId, genre, title, tmdbSourceType
        case tmdbId, traktListId, mediaType, sortBy, sortHow
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        provider = try values.decodeIfPresent(String.self, forKey: .provider) ?? "addon"
        addonId = try values.decodeIfPresent(String.self, forKey: .addonId)
        type = try values.decodeIfPresent(String.self, forKey: .type)
        catalogId = try values.decodeIfPresent(String.self, forKey: .catalogId)
        genre = try values.decodeIfPresent(String.self, forKey: .genre)
        title = try values.decodeIfPresent(String.self, forKey: .title)
        tmdbSourceType = try values.decodeIfPresent(String.self, forKey: .tmdbSourceType)
        tmdbId = try values.decodeIfPresent(Int.self, forKey: .tmdbId)
        traktListId = try values.decodeFlexibleInt64IfPresent(forKey: .traktListId)
        mediaType = try values.decodeIfPresent(String.self, forKey: .mediaType)
        sortBy = try values.decodeIfPresent(String.self, forKey: .sortBy)
        sortHow = try values.decodeIfPresent(String.self, forKey: .sortHow)
    }
}

private extension KeyedDecodingContainer {
    func decodeFlexibleInt64IfPresent(forKey key: Key) throws -> Int64? {
        if let value = try decodeIfPresent(Int64.self, forKey: key) { return value }
        if let value = try decodeIfPresent(String.self, forKey: key) { return Int64(value) }
        return nil
    }
}

struct TVProfile: Decodable, Equatable, Identifiable {
    let id: String
    let profileIndex: Int
    let name: String
    let avatarColorHex: String
    let avatarURL: String?
    let usesPrimaryAddons: Bool

    enum CodingKeys: String, CodingKey {
        case id, name
        case profileIndex = "profile_index"
        case avatarColorHex = "avatar_color_hex"
        case avatarURL = "avatar_url"
        case usesPrimaryAddons = "uses_primary_addons"
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decodeIfPresent(String.self, forKey: .id) ?? ""
        profileIndex = try values.decodeIfPresent(Int.self, forKey: .profileIndex) ?? 1
        name = try values.decodeIfPresent(String.self, forKey: .name) ?? "Profile"
        avatarColorHex = try values.decodeIfPresent(String.self, forKey: .avatarColorHex) ?? "#1E88E5"
        avatarURL = try values.decodeIfPresent(String.self, forKey: .avatarURL)
        usesPrimaryAddons = try values.decodeIfPresent(Bool.self, forKey: .usesPrimaryAddons) ?? false
    }
}
