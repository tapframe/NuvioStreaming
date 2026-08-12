import Foundation

struct SkipInterval: Decodable, Hashable, Identifiable {
    let startTime: Double
    let endTime: Double
    let type: String
    let provider: String

    var id: String { "\(provider):\(type):\(startTime):\(endTime)" }

    var actionTitle: String {
        switch type.lowercased() {
        case "outro", "ed", "mixed-ed", "credits", "ending": return "Skip Ending"
        case "recap": return "Skip Recap"
        default: return "Skip Intro"
        }
    }

    func contains(_ position: Double) -> Bool {
        position >= startTime && position < endTime
    }
}

struct SkipSegmentsService {
    private let session: URLSession
    private let decoder = JSONDecoder()

    init(session: URLSession = .shared) {
        self.session = session
    }

    func intervals(
        imdbID: String,
        season: Int,
        episode: Int,
        settings: TVIntegrationSettings
    ) async -> [SkipInterval] {
        guard settings.skipIntroEnabled else { return [] }
        let entries = await armEntries(imdbID: imdbID)
        let selected = entries.indices.contains(season - 1) ? entries[season - 1] : entries.first
        async let aniSkip: [SkipInterval] = fetchAniSkip(
            malID: selected?.myAnimeList,
            episode: episode
        )
        async let animeSkip = animeSkipIntervals(
            aniListID: selected?.aniList,
            season: season,
            episode: episode,
            settings: settings
        )
        return merge(await aniSkip, await animeSkip)
    }

    private func armEntries(imdbID: String) async -> [ARMEntry] {
        let value = imdbID.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? imdbID
        return await get("https://arm.haglund.dev/api/v2/imdb?id=\(value)&include=myanimelist,anilist") ?? []
    }

    private func fetchAniSkip(malID: Int?, episode: Int) async -> [SkipInterval] {
        guard let malID else { return [] }
        return await aniSkipIntervals(malID: malID, episode: episode)
    }

    private func aniSkipIntervals(malID: Int, episode: Int) async -> [SkipInterval] {
        let types = "types=op&types=ed&types=recap&types=mixed-op&types=mixed-ed"
        let url = "https://api.aniskip.com/v2/skip-times/\(malID)/\(episode)?\(types)&episodeLength=0"
        guard let response: AniSkipResponse = await get(url), response.found else { return [] }
        return response.results.map {
            SkipInterval(
                startTime: $0.interval.startTime,
                endTime: $0.interval.endTime,
                type: $0.skipType,
                provider: "AniSkip"
            )
        }
    }

    private func animeSkipIntervals(
        aniListID: Int?,
        season: Int,
        episode: Int,
        settings: TVIntegrationSettings
    ) async -> [SkipInterval] {
        guard let aniListID, settings.animeSkipReady else { return [] }
        let showsQuery = "{ findShowsByExternalId(service: ANILIST, serviceId: \"\(aniListID)\") { id } }"
        guard let shows: AnimeSkipResponse = await postAnimeSkip(showsQuery, clientID: settings.animeSkipClientID),
              let showID = shows.data?.findShowsByExternalId?.first?.id else { return [] }
        let episodesQuery = "{ findEpisodesByShowId(showId: \"\(showID)\") { season number timestamps { at type { name } } } }"
        guard let response: AnimeSkipResponse = await postAnimeSkip(episodesQuery, clientID: settings.animeSkipClientID),
              let match = response.data?.findEpisodesByShowId?.first(where: {
                  Int($0.number ?? "") == episode && Int($0.season ?? "") == season
              }) else { return [] }
        let timestamps = (match.timestamps ?? []).sorted { $0.at < $1.at }
        return timestamps.enumerated().compactMap { index, timestamp in
            let type: String
            switch timestamp.type.name.lowercased() {
            case "intro", "new intro": type = "op"
            case "credits": type = "ed"
            case "recap": type = "recap"
            default: return nil
            }
            let end = timestamps.indices.contains(index + 1) ? timestamps[index + 1].at : .greatestFiniteMagnitude
            return SkipInterval(startTime: timestamp.at, endTime: end, type: type, provider: "Anime Skip")
        }
    }

    private func merge(_ primary: [SkipInterval], _ secondary: [SkipInterval]) -> [SkipInterval] {
        var categories = Set<String>()
        return (primary + secondary).filter { interval in
            let category = interval.actionTitle
            return categories.insert(category).inserted
        }.sorted { $0.startTime < $1.startTime }
    }

    private func get<T: Decodable>(_ url: String) async -> T? {
        guard let url = URL(string: url) else {
            AppLog.provider.error("Skip provider URL was invalid")
            return nil
        }
        do {
            let (data, response) = try await session.data(from: url)
            guard let http = response as? HTTPURLResponse else {
                AppLog.provider.error("Skip provider returned a non-HTTP response host=\(url.host ?? "unknown", privacy: .public)")
                return nil
            }
            guard (200..<300).contains(http.statusCode) else {
                AppLog.provider.warning("Skip provider failed host=\(url.host ?? "unknown", privacy: .public) status=\(http.statusCode)")
                return nil
            }
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                AppLog.provider.error("Skip provider decode failed host=\(url.host ?? "unknown", privacy: .public) detail=\(AppLog.safeDescription(error), privacy: .public)")
                return nil
            }
        } catch {
            AppLog.provider.warning("Skip provider request failed host=\(url.host ?? "unknown", privacy: .public) detail=\(AppLog.safeDescription(error), privacy: .public)")
            return nil
        }
    }

    private func postAnimeSkip<T: Decodable>(_ query: String, clientID: String) async -> T? {
        guard let url = URL(string: "https://api.anime-skip.com/graphql") else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(clientID, forHTTPHeaderField: "X-Client-ID")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: ["query": query])
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                AppLog.provider.error("Anime Skip returned a non-HTTP response")
                return nil
            }
            guard (200..<300).contains(http.statusCode) else {
                AppLog.provider.warning("Anime Skip failed status=\(http.statusCode)")
                return nil
            }
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                AppLog.provider.error("Anime Skip decode failed detail=\(AppLog.safeDescription(error), privacy: .public)")
                return nil
            }
        } catch {
            AppLog.provider.warning("Anime Skip request failed detail=\(AppLog.safeDescription(error), privacy: .public)")
            return nil
        }
    }
}

private struct ARMEntry: Decodable {
    let myAnimeList: Int?
    let aniList: Int?
    enum CodingKeys: String, CodingKey { case myAnimeList = "myanimelist", aniList = "anilist" }
}

private struct AniSkipResponse: Decodable { let found: Bool; let results: [AniSkipResult] }
private struct AniSkipResult: Decodable { let interval: AniSkipRange; let skipType: String }
private struct AniSkipRange: Decodable { let startTime: Double; let endTime: Double }
private struct AnimeSkipResponse: Decodable { let data: AnimeSkipData? }
private struct AnimeSkipData: Decodable {
    let findShowsByExternalId: [AnimeSkipShow]?
    let findEpisodesByShowId: [AnimeSkipEpisode]?
}
private struct AnimeSkipShow: Decodable { let id: String }
private struct AnimeSkipEpisode: Decodable {
    let season: String?
    let number: String?
    let timestamps: [AnimeSkipTimestamp]?
}
private struct AnimeSkipTimestamp: Decodable { let at: Double; let type: AnimeSkipTimestampType }
private struct AnimeSkipTimestampType: Decodable { let name: String }
