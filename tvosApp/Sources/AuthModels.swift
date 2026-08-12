import Foundation

struct AuthUser: Codable, Equatable {
    let id: String
    let email: String
}

struct AuthSession: Codable, Equatable {
    let accessToken: String
    let refreshToken: String
    let tokenType: String
    let expiresAt: Date
    let user: AuthUser

    var needsRefresh: Bool { expiresAt.timeIntervalSinceNow < 90 }
}

struct TokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String
    let tokenType: String?
    let expiresIn: TimeInterval
    let user: AuthUser?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case tokenType = "token_type"
        case expiresIn = "expires_in"
        case user
    }

    func session(user resolvedUser: AuthUser) -> AuthSession {
        AuthSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            tokenType: tokenType ?? "bearer",
            expiresAt: Date().addingTimeInterval(expiresIn),
            user: resolvedUser
        )
    }
}

struct TVLoginStart: Decodable {
    let code: String
    let webURL: String
    let expiresAt: String
    let pollIntervalSeconds: Int

    enum CodingKeys: String, CodingKey {
        case code
        case webURL = "web_url"
        case expiresAt = "expires_at"
        case pollIntervalSeconds = "poll_interval_seconds"
    }
}

struct TVLoginPoll: Decodable {
    let status: String
    let expiresAt: String?
    let pollIntervalSeconds: Int?

    enum CodingKeys: String, CodingKey {
        case status
        case expiresAt = "expires_at"
        case pollIntervalSeconds = "poll_interval_seconds"
    }
}

struct SyncedAddon: Decodable {
    let url: String
    let name: String?
    let enabled: Bool
    let sortOrder: Int

    enum CodingKeys: String, CodingKey {
        case url, name, enabled
        case sortOrder = "sort_order"
    }
}

enum AuthStatus: Equatable {
    case loading
    case signedOut
    case guest
    case authenticated(AuthSession)
}

enum AuthError: LocalizedError {
    case invalidResponse
    case missingUser
    case server(String)
    case expiredCode

    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "The account service returned an invalid response."
        case .missingUser: return "The account session did not include a user."
        case .server(let message): return message
        case .expiredCode: return "This sign-in code expired. Refresh it and try again."
        }
    }
}
