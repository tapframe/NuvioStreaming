import Foundation

enum StremioServiceError: LocalizedError {
    case invalidURL
    case unsupportedScheme
    case badResponse
    case serverStatus(Int)
    case invalidPayload
    case noPlayableURL

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Enter a complete addon manifest URL."
        case .unsupportedScheme: return "Addon URLs must use HTTP or HTTPS."
        case .badResponse: return "The addon returned an unreadable response."
        case .serverStatus(let status): return "The addon returned status \(status)."
        case .invalidPayload: return "The addon response did not match the Stremio format."
        case .noPlayableURL: return "This source does not include a direct playback URL."
        }
    }
}

struct StremioService {
    static let cinemetaBaseURL = URL(string: "https://v3-cinemeta.strem.io")!
    static let cinemetaManifestURL = URL(string: "https://v3-cinemeta.strem.io/manifest.json")!

    private let session: URLSession
    private let decoder: JSONDecoder

    init(session: URLSession? = nil) {
        if let session {
            self.session = session
        } else {
            let configuration = URLSessionConfiguration.default
            configuration.timeoutIntervalForRequest = 20
            configuration.timeoutIntervalForResource = 45
            configuration.requestCachePolicy = .useProtocolCachePolicy
            configuration.urlCache = .shared
            self.session = URLSession(configuration: configuration)
        }
        decoder = JSONDecoder()
    }

    func cinemetaManifest() async throws -> AddonManifest {
        try await request(Self.cinemetaManifestURL)
    }

    func manifest(at input: String) async throws -> (base: URL, manifest: AddonManifest) {
        let base = try Self.normalizeManifestURL(input)
        let manifest: AddonManifest = try await request(base.appendingPathComponent("manifest.json"))
        return (base, manifest)
    }

    func catalog(
        baseURL: String = Self.cinemetaBaseURL.absoluteString,
        type: String,
        id: String = "top",
        query: String? = nil,
        genre: String? = nil,
        skip: Int? = nil
    ) async throws -> [MetaSummary] {
        let url = try AddonTransport.catalogURL(
            baseURL: baseURL,
            type: type,
            id: id,
            genre: genre,
            search: query,
            skip: skip
        )
        let response: CatalogResponse = try await request(url)
        return response.metas
    }

    func details(type: String, id: String, baseURL: String = Self.cinemetaBaseURL.absoluteString) async throws -> MetaDetail {
        let url = try AddonTransport.resourceURL(
            baseURL: baseURL,
            resource: "meta",
            type: type,
            id: id
        )
        let response: MetaResponse = try await request(url)
        return response.meta
    }

    func streams(type: String, id: String, addons: [AddonEndpoint]) async -> StreamFetchReport {
        await withTaskGroup(of: (Int, String, [StreamSource]?, String?).self) { group in
            for (index, addon) in addons.enumerated() where addon.providesStreams {
                group.addTask {
                    do {
                        let url = try AddonTransport.resourceURL(
                            baseURL: addon.baseURL,
                            resource: "stream",
                            type: type,
                            id: id
                        )
                        let response: StreamResponse = try await request(url)
                        return (
                            index,
                            addon.name,
                            response.streams.map { StreamSource(addonName: addon.name, stream: $0) },
                            nil
                        )
                    } catch {
                        return (index, addon.name, nil, error.userMessage)
                    }
                }
            }

            var results: [(Int, String, [StreamSource]?, String?)] = []
            for await result in group { results.append(result) }
            results.sort { $0.0 < $1.0 }
            return StreamFetchReport(
                sources: results.flatMap { $0.2 ?? [] },
                failures: results.compactMap { result in
                    result.3.map { "\(result.1): \($0)" }
                }
            )
        }
    }

    func request<T: Decodable>(_ url: URL) async throws -> T {
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("NuvioTV/1.0", forHTTPHeaderField: "User-Agent")

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw StremioServiceError.badResponse
            }
            guard (200...299).contains(http.statusCode) else {
                throw StremioServiceError.serverStatus(http.statusCode)
            }
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                let detail = Self.decodeFailureDetail(error)
                AppLog.provider.error("Provider decode failed host=\(url.host ?? "unknown", privacy: .public) path=\(url.path, privacy: .public) type=\(String(describing: T.self), privacy: .public) detail=\(detail, privacy: .public) bytes=\(data.count)")
                throw StremioServiceError.invalidPayload
            }
        } catch let error as StremioServiceError {
            throw error
        } catch {
            throw NSError(
                domain: "NuvioTV.Network",
                code: (error as NSError).code,
                userInfo: [NSLocalizedDescriptionKey: "Network request failed: \(error.localizedDescription)"]
            )
        }
    }

    private static func decodeFailureDetail(_ error: Error) -> String {
        switch error {
        case DecodingError.keyNotFound(let key, let context):
            return "missing \(key.stringValue) at \(codingPath(context.codingPath))"
        case DecodingError.typeMismatch(let type, let context):
            return "expected \(type) at \(codingPath(context.codingPath))"
        case DecodingError.valueNotFound(let type, let context):
            return "missing \(type) at \(codingPath(context.codingPath))"
        case DecodingError.dataCorrupted(let context):
            return "corrupt data at \(codingPath(context.codingPath))"
        default:
            let nsError = error as NSError
            return "\(nsError.domain) code=\(nsError.code)"
        }
    }

    private static func codingPath(_ path: [CodingKey]) -> String {
        let value = path.map(\.stringValue).joined(separator: ".")
        return value.isEmpty ? "root" : value
    }

    static func normalizeManifestURL(_ input: String) throws -> URL {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var components = URLComponents(string: trimmed),
              let scheme = components.scheme?.lowercased(),
              components.host != nil else {
            throw StremioServiceError.invalidURL
        }
        guard scheme == "http" || scheme == "https" else {
            throw StremioServiceError.unsupportedScheme
        }

        components.fragment = nil
        if components.path.hasSuffix("/manifest.json") {
            components.path.removeLast("/manifest.json".count)
        }
        while components.path.count > 1 && components.path.hasSuffix("/") {
            components.path.removeLast()
        }
        guard let result = components.url else { throw StremioServiceError.invalidURL }
        return result
    }


    static func manifestProvidesMeta(_ manifest: AddonManifest, type: String, id: String) -> Bool {
        manifestSupportsResource(manifest, name: "meta", type: type, id: id)
    }

    static func manifestSupportsID(_ manifest: AddonManifest, type: String, id: String) -> Bool {
        manifestSupportsResource(manifest, name: "meta", type: type, id: id)
    }

    private static func manifestSupportsResource(_ manifest: AddonManifest, name: String, type: String, id: String) -> Bool {
        for resource in manifest.resources where resource.name == name {
            guard resource.types.isEmpty || resource.types.contains(type) else { continue }
            guard resource.idPrefixes.isEmpty || resource.idPrefixes.contains(where: { id.hasPrefix($0) }) else { continue }
            return true
        }
        return false
    }

    static func catalogURL(type: String, id: String, query: String?) throws -> URL {
        try AddonTransport.catalogURL(
            baseURL: cinemetaBaseURL.absoluteString,
            type: type,
            id: id,
            search: query
        )
    }
}

extension Error {
    var userMessage: String {
        (self as? LocalizedError)?.errorDescription ?? localizedDescription
    }
}
