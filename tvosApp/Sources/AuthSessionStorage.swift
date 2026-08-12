import Foundation
import Security

protocol AuthSessionStorage {
    func load() -> AuthSession?
    func save(_ session: AuthSession) throws
    func clear()
}

struct KeychainAuthSessionStorage: AuthSessionStorage {
    private let service: String
    private let account = "account-session"

    init(bundleIdentifier: String? = Bundle.main.bundleIdentifier) {
        service = "\(bundleIdentifier ?? "com.nuvio.app.tvos").auth"
    }

    func load() -> AuthSession? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(AuthSession.self, from: data)
    }

    func save(_ session: AuthSession) throws {
        let data = try JSONEncoder().encode(session)
        let status = SecItemUpdate(
            baseQuery as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )
        if status == errSecItemNotFound {
            var item = baseQuery
            item[kSecValueData as String] = data
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            let addStatus = SecItemAdd(item as CFDictionary, nil)
            guard addStatus == errSecSuccess else { throw KeychainStorageError.status(addStatus) }
        } else if status != errSecSuccess {
            throw KeychainStorageError.status(status)
        }
    }

    func clear() {
        SecItemDelete(baseQuery as CFDictionary)
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}

private enum KeychainStorageError: Error {
    case status(OSStatus)
}
