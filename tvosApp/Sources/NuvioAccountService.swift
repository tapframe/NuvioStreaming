import Foundation

struct NuvioAccountService {
    static let baseURL = URL(string: "https://api.nuvio.tv")!
    static let webLoginURL = "https://nuvio.tv/tv-login"
    static let anonKey = "sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN"

    private let session: URLSession
    private let decoder = JSONDecoder()

    init(session: URLSession = .shared) {
        self.session = session
    }

    func signIn(email: String, password: String) async throws -> TokenResponse {
        try await request(
            url: Self.tokenURL(grantType: "password"),
            body: ["email": email, "password": password]
        )
    }

    func refresh(token: String) async throws -> TokenResponse {
        try await request(
            url: Self.tokenURL(grantType: "refresh_token"),
            body: ["refresh_token": token]
        )
    }

    static func tokenURL(grantType: String) -> URL {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        components.path = "/auth/v1/token"
        components.queryItems = [URLQueryItem(name: "grant_type", value: grantType)]
        return components.url!
    }

    private func endpointURL(path: String) -> URL {
        Self.baseURL.appending(path: path)
    }

    func user(accessToken: String) async throws -> AuthUser {
        var request = URLRequest(url: Self.baseURL.appending(path: "/auth/v1/user"))
        request.httpMethod = "GET"
        addHeaders(to: &request, accessToken: accessToken)
        return try await execute(request)
    }

    func signOut(accessToken: String) async throws {
        var request = URLRequest(url: Self.baseURL.appending(path: "/auth/v1/logout"))
        request.httpMethod = "POST"
        addHeaders(to: &request, accessToken: accessToken)
        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw AuthError.invalidResponse
        }
    }

    func startTVLogin(nonce: String, deviceName: String) async throws -> TVLoginStart {
        let rows: [TVLoginStart] = try await request(
            url: endpointURL(path: "/rest/v1/rpc/start_tv_login_session"),
            body: [
                "p_device_nonce": nonce,
                "p_redirect_base_url": Self.webLoginURL,
                "p_device_name": deviceName,
            ]
        )
        guard let first = rows.first else { throw AuthError.invalidResponse }
        return first
    }

    func pollTVLogin(code: String, nonce: String) async throws -> TVLoginPoll {
        let rows: [TVLoginPoll] = try await request(
            url: endpointURL(path: "/rest/v1/rpc/poll_tv_login_session"),
            body: ["p_code": code, "p_device_nonce": nonce]
        )
        guard let first = rows.first else { throw AuthError.invalidResponse }
        return first
    }

    func exchangeTVLogin(code: String, nonce: String) async throws -> TokenResponse {
        try await request(
            url: endpointURL(path: "/functions/v1/tv-logins-exchange"),
            body: ["code": code, "device_nonce": nonce]
        )
    }

    func effectiveOwner(accessToken: String) async throws -> String {
        try await request(
            url: endpointURL(path: "/rest/v1/rpc/get_sync_owner"),
            body: [String: String](),
            accessToken: accessToken
        )
    }

    func addons(accessToken: String, ownerID: String, profileID: Int = 1) async throws -> [SyncedAddon] {
        var components = URLComponents(
            url: Self.baseURL.appending(path: "/rest/v1/addons"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            URLQueryItem(name: "select", value: "url,name,enabled,sort_order"),
            URLQueryItem(name: "user_id", value: "eq.\(ownerID)"),
            URLQueryItem(name: "profile_id", value: "eq.\(profileID)"),
            URLQueryItem(name: "order", value: "sort_order.asc"),
        ]
        var request = URLRequest(url: components.url!)
        request.httpMethod = "GET"
        addHeaders(to: &request, accessToken: accessToken)
        return try await execute(request)
    }

    func profiles(accessToken: String) async throws -> [TVProfile] {
        try await request(
            url: endpointURL(path: "/rest/v1/rpc/sync_pull_profiles"),
            body: EmptyAccountPayload(),
            accessToken: accessToken
        )
    }

    func watchProgress(accessToken: String, profileID: Int) async throws -> [SyncWatchProgressRecord] {
        try await request(
            url: endpointURL(path: "/rest/v1/rpc/sync_pull_watch_progress"),
            body: ProfilePayload(pProfileID: profileID),
            accessToken: accessToken
        )
    }

    func save(_ records: [WatchProgressRecord], accessToken: String, profileID: Int) async throws {
        let entries = records.map(SyncWatchProgressRecord.init)
        try await requestVoid(
            path: "/rest/v1/rpc/sync_push_watch_progress",
            jsonBody: [
                "p_profile_id": profileID,
                "p_entries": entries.map(\.jsonObject),
                "p_origin_client_id": TVSyncClientIdentity.current(),
            ],
            accessToken: accessToken
        )
    }

    func saveAddons(_ addons: [AddonEndpoint], accessToken: String, profileID: Int) async throws {
        let rows: [[String: Any]] = addons.enumerated().map { index, addon in
            [
                "url": addon.baseURL,
                "name": addon.name,
                "enabled": true,
                "sort_order": index,
            ]
        }
        try await requestVoid(
            path: "/rest/v1/rpc/sync_push_addons",
            jsonBody: [
                "p_profile_id": profileID,
                "p_addons": rows,
                "p_origin_client_id": TVSyncClientIdentity.current(),
            ],
            accessToken: accessToken
        )
    }

    func saveHomePreferences(
        _ preferences: HomePreferences,
        accessToken: String,
        profileID: Int
    ) async throws {
        try await requestVoid(
            path: "/rest/v1/rpc/sync_push_home_catalog_settings",
            jsonBody: [
                "p_profile_id": profileID,
                "p_platform": "home_catalog_shared",
                "p_settings_json": preferences.syncJSONObject,
                "p_origin_client_id": TVSyncClientIdentity.current(),
            ],
            accessToken: accessToken
        )
    }

    func collections(accessToken: String, profileID: Int) async throws -> [TVCollection] {
        let rows: [CollectionSyncBlob] = try await request(
            url: endpointURL(path: "/rest/v1/rpc/sync_pull_collections"),
            body: ProfilePayload(pProfileID: profileID),
            accessToken: accessToken
        )
        return rows.first?.collections ?? []
    }

    func homePreferences(accessToken: String, profileID: Int) async throws -> HomePreferences? {
        let rows: [HomeCatalogSyncBlob] = try await request(
            url: endpointURL(path: "/rest/v1/rpc/sync_pull_home_catalog_settings"),
            body: HomeSettingsPayload(pProfileID: profileID, pPlatform: "home_catalog_shared"),
            accessToken: accessToken
        )
        guard let payload = rows.first?.settingsJSON else { return nil }
        let items = payload.items.map { item in
            let fallbackKey = item.isCollection
                ? "collection_\(item.collectionID)"
                : "\(item.addonID):\(item.type):\(item.catalogID)"
            return HomeCatalogPreference(
                key: item.key.isEmpty ? fallbackKey : item.key,
                enabled: item.enabled,
                order: item.order,
                customTitle: item.customTitle
            )
        }
        return HomePreferences(
            heroEnabled: true,
            showCatalogType: payload.showCatalogType,
            hideUnreleasedContent: payload.hideUnreleasedContent,
            items: items
        )
    }

    func library(accessToken: String, profileID: Int) async throws -> [LibrarySyncRecord] {
        try await request(
            url: endpointURL(path: "/rest/v1/rpc/sync_pull_library"),
            body: LibraryPullPayload(pProfileID: profileID, pLimit: 500, pOffset: 0),
            accessToken: accessToken
        )
    }

    func profileSettings(accessToken: String, profileID: Int = 1) async throws -> TVIntegrationSettings? {

        let params = ["p_profile_id": profileID, "p_platform": "mobile"] as [String: Any]
        let body = try JSONSerialization.data(withJSONObject: params)
        var request = URLRequest(url: Self.baseURL.appending(path: "/rest/v1/rpc/sync_pull_profile_settings_blob"))
        request.httpMethod = "POST"
        addHeaders(to: &request, accessToken: accessToken)
        request.httpBody = body
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw AuthError.invalidResponse
        }
        guard let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let settingsJSON = rows.first?["settings_json"] as? [String: Any],
              let features = settingsJSON["features"] as? [String: Any],
              let player = features["player_settings"] as? [String: Any] else { return nil }
        return TVIntegrationSettings(
            skipIntroEnabled: syncBoolean("skip_intro_enabled", in: player) ?? true,
            animeSkipEnabled: syncBoolean("animeskip_enabled", in: player) ?? false,
            animeSkipClientID: syncString("animeskip_client_id", in: player) ?? ""
        )
    }

    private func syncBoolean(_ key: String, in payload: [String: Any]) -> Bool? {
        (payload[key] as? [String: Any])?["value"] as? Bool
    }

    private func syncString(_ key: String, in payload: [String: Any]) -> String? {
        (payload[key] as? [String: Any])?["value"] as? String
    }

    func requestVoid(path: String, jsonBody: [String: Any], accessToken: String) async throws {
        var request = URLRequest(url: Self.baseURL.appending(path: path))
        request.httpMethod = "POST"
        addHeaders(to: &request, accessToken: accessToken)
        request.httpBody = try JSONSerialization.data(withJSONObject: jsonBody)
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw AccountServiceError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw AccountServiceError.http(status: http.statusCode, message: serverMessage(from: data))
        }
        AppLog.account.debug("POST \(path, privacy: .public) completed status=\(http.statusCode)")
    }

    private func request<T: Decodable, B: Encodable>(
        url: URL,
        body: B,
        accessToken: String? = nil
    ) async throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        addHeaders(to: &request, accessToken: accessToken)
        request.httpBody = try JSONEncoder().encode(body)
        return try await execute(request)
    }

    private func addHeaders(to request: inout URLRequest, accessToken: String? = nil) {
        request.setValue(Self.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
    }

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw AccountServiceError.invalidResponse }
        let endpoint = request.url?.path ?? "unknown endpoint"
        guard (200..<300).contains(http.statusCode) else {
            throw AccountServiceError.http(status: http.statusCode, message: serverMessage(from: data))
        }
        do {
            let decoded = try decoder.decode(T.self, from: data)
            AppLog.account.debug("\(request.httpMethod ?? "REQUEST", privacy: .public) \(endpoint, privacy: .public) completed status=\(http.statusCode) bytes=\(data.count)")
            return decoded
        } catch {
            let detail = Self.decodeFailureDetail(error)
            AppLog.account.error("Decode failed endpoint=\(endpoint, privacy: .public) type=\(String(describing: T.self), privacy: .public) detail=\(detail, privacy: .public) bytes=\(data.count)")
            throw AccountServiceError.decoding(
                endpoint: endpoint,
                type: String(describing: T.self),
                detail: detail
            )
        }
    }

    private static func decodeFailureDetail(_ error: Error) -> String {
        switch error {
        case DecodingError.keyNotFound(let key, let context):
            return "missing key \(key.stringValue) at \(codingPath(context.codingPath))"
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
        path.map(\.stringValue).joined(separator: ".").isEmpty ? "root" : path.map(\.stringValue).joined(separator: ".")
    }

    private func serverMessage(from data: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return (object["msg"] ?? object["message"] ?? object["error_description"] ?? object["error"]) as? String
    }

}

private extension SyncWatchProgressRecord {
    init(_ record: WatchProgressRecord) {
        self.init(
            contentID: record.contentID,
            contentType: record.contentType,
            videoID: record.videoID,
            season: record.season,
            episode: record.episode,
            position: record.position,
            duration: record.duration,
            lastWatched: record.lastWatched,
            progressKey: record.progressKey
        )
    }

    var jsonObject: [String: Any] {
        var payload: [String: Any] = [
            "content_id": contentID,
            "content_type": contentType,
            "video_id": videoID,
            "position": position,
            "duration": duration,
            "last_watched": lastWatched,
            "progress_key": progressKey,
        ]
        if let season { payload["season"] = season }
        if let episode { payload["episode"] = episode }
        return payload
    }
}

private struct EmptyAccountPayload: Encodable {}

private struct ProfilePayload: Encodable {
    let pProfileID: Int
    enum CodingKeys: String, CodingKey { case pProfileID = "p_profile_id" }
}

private struct HomeSettingsPayload: Encodable {
    let pProfileID: Int
    let pPlatform: String
    enum CodingKeys: String, CodingKey {
        case pProfileID = "p_profile_id"
        case pPlatform = "p_platform"
    }
}

private struct LibraryPullPayload: Encodable {
    let pProfileID: Int
    let pLimit: Int
    let pOffset: Int
    enum CodingKeys: String, CodingKey {
        case pProfileID = "p_profile_id"
        case pLimit = "p_limit"
        case pOffset = "p_offset"
    }
}
