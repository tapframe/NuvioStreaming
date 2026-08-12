import Foundation

struct CatalogResponse: Decodable {
    let metas: [MetaSummary]

    private enum CodingKeys: String, CodingKey { case metas }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        guard let values = try? container.decode([Lossy<MetaSummary>].self, forKey: .metas) else {
            throw DecodingError.typeMismatch(
                [MetaSummary].self,
                DecodingError.Context(codingPath: container.codingPath + [CodingKeys.metas], debugDescription: "metas must be an array")
            )
        }
        metas = values.compactMap(\.value)
    }
}

struct MetaResponse: Decodable {
    let meta: MetaDetail
}

struct StreamResponse: Decodable {
    let streams: [StremioStream]

    private enum CodingKeys: String, CodingKey { case streams }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        guard let values = try? container.decode([Lossy<StremioStream>].self, forKey: .streams) else {
            throw DecodingError.typeMismatch(
                [StremioStream].self,
                DecodingError.Context(codingPath: container.codingPath + [CodingKeys.streams], debugDescription: "streams must be an array")
            )
        }
        streams = values.compactMap(\.value)
    }
}

struct MetaSummary: Codable, Hashable, Identifiable {
    let id: String
    let type: String
    let name: String
    let poster: String?
    let background: String?
    let description: String?
    let releaseInfo: String?
    let released: String?
    let playbackVideoID: String?
    let playbackSeason: Int?
    let playbackEpisode: Int?
    let metadataBaseURL: String?
    let genres: [String]

    private enum CodingKeys: String, CodingKey {
        case id, type, name, poster, background, description, releaseInfo, released
        case playbackVideoID, playbackSeason, playbackEpisode, metadataBaseURL, genres, genre
    }

    init(
        id: String,
        type: String,
        name: String,
        poster: String? = nil,
        background: String? = nil,
        description: String? = nil,
        releaseInfo: String? = nil,
        released: String? = nil,
        playbackVideoID: String? = nil,
        playbackSeason: Int? = nil,
        playbackEpisode: Int? = nil,
        metadataBaseURL: String? = nil,
        genres: [String] = []
    ) {
        self.id = id
        self.type = type
        self.name = name
        self.poster = poster
        self.background = background
        self.description = description
        self.releaseInfo = releaseInfo
        self.released = released
        self.playbackVideoID = playbackVideoID
        self.playbackSeason = playbackSeason
        self.playbackEpisode = playbackEpisode
        self.metadataBaseURL = metadataBaseURL
        self.genres = genres
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeRequiredFlexibleString(forKey: .id)
        type = try container.decodeRequiredFlexibleString(forKey: .type)
        name = try container.decodeRequiredFlexibleString(forKey: .name)
        poster = container.decodeFlexibleString(forKey: .poster)
        background = container.decodeFlexibleString(forKey: .background)
        description = container.decodeFlexibleString(forKey: .description)
        releaseInfo = container.decodeFlexibleString(forKey: .releaseInfo)
        released = container.decodeFlexibleString(forKey: .released)
        playbackVideoID = container.decodeFlexibleString(forKey: .playbackVideoID)
        playbackSeason = container.decodeFlexibleInt(forKey: .playbackSeason)
        playbackEpisode = container.decodeFlexibleInt(forKey: .playbackEpisode)
        metadataBaseURL = container.decodeFlexibleString(forKey: .metadataBaseURL)
        genres = container.decodeStringArray(forKeys: [.genres, .genre])
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(type, forKey: .type)
        try container.encode(name, forKey: .name)
        try container.encodeIfPresent(poster, forKey: .poster)
        try container.encodeIfPresent(background, forKey: .background)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encodeIfPresent(releaseInfo, forKey: .releaseInfo)
        try container.encodeIfPresent(released, forKey: .released)
        try container.encodeIfPresent(playbackVideoID, forKey: .playbackVideoID)
        try container.encodeIfPresent(playbackSeason, forKey: .playbackSeason)
        try container.encodeIfPresent(playbackEpisode, forKey: .playbackEpisode)
        try container.encodeIfPresent(metadataBaseURL, forKey: .metadataBaseURL)
        try container.encode(genres, forKey: .genres)
    }
    var libraryJSONObject: [String: Any] {
        var value: [String: Any] = [
            "content_id": id,
            "content_type": type,
            "name": name,
            "poster_shape": "POSTER",
            "genres": genres,
            "added_at": Int64(Date().timeIntervalSince1970 * 1_000),
        ]
        if let poster { value["poster"] = poster }
        if let background { value["background"] = background }
        if let description { value["description"] = description }
        if let releaseInfo { value["release_info"] = releaseInfo }
        if let metadataBaseURL { value["addon_base_url"] = metadataBaseURL }
        return value
    }

    func withMetadataBaseURL(_ baseURL: String) -> MetaSummary {
        MetaSummary(
            id: id, type: type, name: name, poster: poster, background: background,
            description: description, releaseInfo: releaseInfo, released: released,
            playbackVideoID: playbackVideoID, playbackSeason: playbackSeason,
            playbackEpisode: playbackEpisode, metadataBaseURL: baseURL, genres: genres
        )
    }

    func routedTo(videoID: String, season: Int?, episode: Int?) -> MetaSummary {
        MetaSummary(
            id: id,
            type: type,
            name: name,
            poster: poster,
            background: background,
            description: description,
            releaseInfo: releaseInfo,
            released: released,
            playbackVideoID: videoID,
            playbackSeason: season,
            playbackEpisode: episode,
            metadataBaseURL: metadataBaseURL,
            genres: genres
        )
    }
}

struct MetaDetail: Decodable, Identifiable {
    let id: String
    let type: String
    let name: String
    let poster: String?
    let background: String?
    let description: String?
    let releaseInfo: String?
    let released: String?
    let runtime: String?
    let imdbRating: String?
    let genres: [String]
    let videos: [StremioVideo]

    private enum CodingKeys: String, CodingKey {
        case id, type, name, poster, background, description, releaseInfo
        case released, runtime, imdbRating, genres, genre, videos
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeRequiredFlexibleString(forKey: .id)
        type = try container.decodeRequiredFlexibleString(forKey: .type)
        name = try container.decodeRequiredFlexibleString(forKey: .name)
        poster = container.decodeFlexibleString(forKey: .poster)
        background = container.decodeFlexibleString(forKey: .background)
        description = container.decodeFlexibleString(forKey: .description)
        releaseInfo = container.decodeFlexibleString(forKey: .releaseInfo)
        released = container.decodeFlexibleString(forKey: .released)
        runtime = container.decodeFlexibleString(forKey: .runtime)
        imdbRating = container.decodeFlexibleString(forKey: .imdbRating)
        genres = container.decodeStringArray(forKeys: [.genres, .genre])
        videos = container.decodeLossyArray(StremioVideo.self, forKey: .videos)
    }

    var summary: MetaSummary {
        MetaSummary(
            id: id,
            type: type,
            name: name,
            poster: poster,
            background: background,
            description: description,
            releaseInfo: releaseInfo,
            released: released,
            genres: genres
        )
    }
}

struct StremioVideo: Decodable, Hashable, Identifiable {
    let id: String
    let name: String
    let season: Int?
    let episode: Int?
    let released: String?
    let description: String?
    let thumbnail: String?

    private enum CodingKeys: String, CodingKey {
        case id, name, title, season, episode, number, released
        case description, overview, thumbnail
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeRequiredFlexibleString(forKey: .id)
        name = container.decodeFlexibleString(forKey: .name)
            ?? container.decodeFlexibleString(forKey: .title)
            ?? "Episode"
        season = container.decodeFlexibleInt(forKey: .season)
        episode = container.decodeFlexibleInt(forKey: .episode)
            ?? container.decodeFlexibleInt(forKey: .number)
        released = container.decodeFlexibleString(forKey: .released)
        description = container.decodeFlexibleString(forKey: .description)
            ?? container.decodeFlexibleString(forKey: .overview)
        thumbnail = container.decodeFlexibleString(forKey: .thumbnail)
    }

    var label: String {
        if let season, let episode { return "S\(season) E\(episode)  \(name)" }
        return name
    }
}

struct StremioStream: Decodable, Hashable, Identifiable {
    let id: UUID
    let name: String
    let title: String?
    let description: String?
    let url: String?
    let requestHeaders: [String: String]
    let responseHeaders: [String: String]

    private enum CodingKeys: String, CodingKey { case name, title, description, url, behaviorHints }
    private enum BehaviorHintKeys: String, CodingKey { case proxyHeaders }
    private enum ProxyHeaderKeys: String, CodingKey { case request, response }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = UUID()
        name = container.decodeFlexibleString(forKey: .name)
            ?? container.decodeFlexibleString(forKey: .title)
            ?? "Unnamed source"
        title = container.decodeFlexibleString(forKey: .title)
        description = container.decodeFlexibleString(forKey: .description)
        url = container.decodeFlexibleString(forKey: .url)
        let hints = try? container.nestedContainer(keyedBy: BehaviorHintKeys.self, forKey: .behaviorHints)
        let proxy = try? hints?.nestedContainer(keyedBy: ProxyHeaderKeys.self, forKey: .proxyHeaders)
        requestHeaders = (try? proxy?.decode([String: String].self, forKey: .request)) ?? [:]
        responseHeaders = (try? proxy?.decode([String: String].self, forKey: .response)) ?? [:]
    }

    var directURL: URL? {
        guard let url, let value = URL(string: url), let scheme = value.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else { return nil }
        return value
    }
}

struct HomeAddon {
    let baseURL: String
    let name: String
    let manifest: AddonManifest
}

struct AddonEndpoint: Codable, Hashable, Identifiable {
    let baseURL: String
    let name: String
    let detail: String?
    let providesStreams: Bool
    let manifest: AddonManifest?

    init(
        baseURL: String,
        name: String,
        detail: String?,
        providesStreams: Bool,
        manifest: AddonManifest? = nil
    ) {
        self.baseURL = baseURL
        self.name = name
        self.detail = detail
        self.providesStreams = providesStreams
        self.manifest = manifest
    }

    var id: String { baseURL }
}

struct StreamSource: Identifiable, Hashable {
    let addonName: String
    let stream: StremioStream

    var id: UUID { stream.id }
}

struct StreamFetchReport {
    let sources: [StreamSource]
    let failures: [String]
}

extension KeyedDecodingContainer {
    func decodeRequiredFlexibleString(forKey key: Key) throws -> String {
        if let value = decodeFlexibleString(forKey: key)?.trimmedNonEmpty { return value }
        throw DecodingError.valueNotFound(
            String.self,
            DecodingError.Context(codingPath: codingPath + [key], debugDescription: "Required string is missing")
        )
    }

    func decodeFlexibleString(forKey key: Key) -> String? {
        if let value = try? decode(String.self, forKey: key) { return value }
        if let value = try? decode(Int.self, forKey: key) { return String(value) }
        if let value = try? decode(Double.self, forKey: key) { return String(value) }
        return nil
    }

    func decodeFlexibleInt(forKey key: Key) -> Int? {
        if let value = try? decode(Int.self, forKey: key) { return value }
        if let value = try? decode(String.self, forKey: key) { return Int(value) }
        return nil
    }

    func decodeStringArray(forKeys keys: [Key]) -> [String] {
        for key in keys {
            if let values = try? decode([String].self, forKey: key) {
                return values
            }
            if let value = try? decode(String.self, forKey: key) {
                return [value]
            }
        }
        return []
    }

    func decodeLossyArray<T: Decodable>(_ type: T.Type, forKey key: Key) -> [T] {
        guard let values = try? decode([Lossy<T>].self, forKey: key) else { return [] }
        return values.compactMap(\.value)
    }
}

struct Lossy<Value: Decodable>: Decodable {
    let value: Value?

    init(from decoder: Decoder) throws {
        value = try? Value(from: decoder)
    }
}
