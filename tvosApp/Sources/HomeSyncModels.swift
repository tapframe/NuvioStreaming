import Foundation

struct WatchProgressRecord: Codable, Equatable, Identifiable {
    let contentID: String
    let contentType: String
    let videoID: String
    let season: Int?
    let episode: Int?
    var position: Int64
    var duration: Int64
    var lastWatched: Int64
    let progressKey: String
    var summary: MetaSummary?
    var episodeTitle: String?
    var episodeThumbnail: String?

    var id: String { progressKey }

    enum CodingKeys: String, CodingKey {
        case contentID = "content_id"
        case contentType = "content_type"
        case videoID = "video_id"
        case season, episode, position, duration
        case lastWatched = "last_watched"
        case progressKey = "progress_key"
        case summary, episodeTitle, episodeThumbnail
    }

    var isCompleted: Bool {
        duration > 0 && Double(position) / Double(duration) >= 0.90
    }

    static func key(contentID: String, videoID: String, season: Int?, episode: Int?) -> String {
        if let season, let episode { return "\(contentID)_s\(season)e\(episode)" }
        return contentID
    }
}

struct SyncWatchProgressRecord: Codable {
    let contentID: String
    let contentType: String
    let videoID: String
    let season: Int?
    let episode: Int?
    let position: Int64
    let duration: Int64
    let lastWatched: Int64
    let progressKey: String

    enum CodingKeys: String, CodingKey {
        case contentID = "content_id"
        case contentType = "content_type"
        case videoID = "video_id"
        case season, episode, position, duration
        case lastWatched = "last_watched"
        case progressKey = "progress_key"
    }
}

struct HomeCatalogSyncBlob: Decodable {
    let settingsJSON: HomeCatalogSyncPayload?
    enum CodingKeys: String, CodingKey { case settingsJSON = "settings_json" }
}

struct HomeCatalogSyncPayload: Decodable {
    let showCatalogType: Bool
    let hideUnreleasedContent: Bool
    let items: [HomeCatalogSyncItem]

    enum CodingKeys: String, CodingKey {
        case showCatalogType = "show_catalog_type"
        case hideUnreleasedContent = "hide_unreleased_content"
        case items
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        showCatalogType = try values.decodeIfPresent(Bool.self, forKey: .showCatalogType) ?? true
        hideUnreleasedContent = try values.decodeIfPresent(Bool.self, forKey: .hideUnreleasedContent) ?? false
        items = try values.decodeIfPresent([HomeCatalogSyncItem].self, forKey: .items) ?? []
    }
}

struct HomeCatalogSyncItem: Decodable {
    let addonID: String
    let type: String
    let catalogID: String
    let enabled: Bool
    let order: Int
    let customTitle: String
    let isCollection: Bool
    let collectionID: String
    let key: String

    enum CodingKeys: String, CodingKey {
        case addonID = "addon_id"
        case type
        case catalogID = "catalog_id"
        case enabled, order
        case customTitle = "custom_title"
        case isCollection = "is_collection"
        case collectionID = "collection_id"
        case key
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        addonID = try values.decodeIfPresent(String.self, forKey: .addonID) ?? ""
        type = try values.decodeIfPresent(String.self, forKey: .type) ?? ""
        catalogID = try values.decodeIfPresent(String.self, forKey: .catalogID) ?? ""
        enabled = try values.decodeIfPresent(Bool.self, forKey: .enabled) ?? true
        order = try values.decodeIfPresent(Int.self, forKey: .order) ?? 0
        customTitle = try values.decodeIfPresent(String.self, forKey: .customTitle) ?? ""
        isCollection = try values.decodeIfPresent(Bool.self, forKey: .isCollection) ?? false
        collectionID = try values.decodeIfPresent(String.self, forKey: .collectionID) ?? ""
        key = try values.decodeIfPresent(String.self, forKey: .key) ?? ""
    }
}

struct CollectionSyncBlob: Decodable {
    let collections: [TVCollection]

    enum CodingKeys: String, CodingKey { case collections = "collections_json" }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        collections = try values.decodeIfPresent([TVCollection].self, forKey: .collections) ?? []
    }
}

struct LibrarySyncRecord: Decodable {
    let contentID: String
    let contentType: String
    let name: String
    let poster: String?
    let background: String?
    let description: String?
    let releaseInfo: String?
    let genres: [String]

    enum CodingKeys: String, CodingKey {
        case contentID = "content_id"
        case contentType = "content_type"
        case name, poster, background, description, genres
        case releaseInfo = "release_info"
    }

    var summary: MetaSummary {
        MetaSummary(
            id: contentID,
            type: contentType,
            name: name,
            poster: poster,
            background: background,
            description: description,
            releaseInfo: releaseInfo,
            genres: genres
        )
    }
}
