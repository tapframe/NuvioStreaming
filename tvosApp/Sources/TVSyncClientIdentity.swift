import Foundation

enum TVSyncClientIdentity {
    private static let key = "nuvio.tv.syncClientID.v1"

    static func current(defaults: UserDefaults = .standard) -> String {
        if let value = defaults.string(forKey: key), isValid(value) { return value }
        let generated = "nuvio-tvos-\(UUID().uuidString.lowercased())"
        defaults.set(generated, forKey: key)
        return generated
    }

    static func clear(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: key)
    }

    private static func isValid(_ value: String) -> Bool {
        guard (16...96).contains(value.count) else { return false }
        return value.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }
    }
}
