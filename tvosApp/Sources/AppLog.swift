import Foundation
import OSLog

enum AppLog {
    private static let subsystem = Bundle.main.bundleIdentifier ?? "com.nuvio.app.tvos"

    static let account = Logger(subsystem: subsystem, category: "account")
    static let sync = Logger(subsystem: subsystem, category: "sync")
    static let home = Logger(subsystem: subsystem, category: "home")
    static let provider = Logger(subsystem: subsystem, category: "provider")
    static let playback = Logger(subsystem: subsystem, category: "playback")

    static func console(_ message: String) {
#if DEBUG
        print("NUVIO_LOG \(message)")
        fflush(stdout)
#endif
    }

    static func safeDescription(_ error: Error) -> String {
        if let accountError = error as? AccountServiceError {
            return accountError.errorDescription ?? "Account service error"
        }
        if let stremioError = error as? StremioServiceError {
            return stremioError.errorDescription ?? "Provider error"
        }
        let nsError = error as NSError
        return "\(nsError.domain) code=\(nsError.code)"
    }
}

enum AccountServiceError: LocalizedError {
    case invalidResponse
    case http(status: Int, message: String?)
    case decoding(endpoint: String, type: String, detail: String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "The account service returned an invalid response."
        case .http(let status, let message):
            return message ?? "Account request failed (\(status))."
        case .decoding(let endpoint, let type, let detail):
            return "Could not decode \(type) from \(endpoint): \(detail)"
        }
    }
}
