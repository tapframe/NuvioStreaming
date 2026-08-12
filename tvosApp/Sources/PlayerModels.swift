import Foundation

enum PlayerResizeMode: String, CaseIterable, Identifiable {
    case fit
    case fill
    case original

    var id: String { rawValue }

    var title: String {
        switch self {
        case .fit: return "Fit"
        case .fill: return "Fill"
        case .original: return "Original"
        }
    }

    var symbol: String {
        switch self {
        case .fit: return "rectangle.inset.filled"
        case .fill: return "rectangle.fill"
        case .original: return "1.square"
        }
    }
}

struct PlaybackTrack: Identifiable, Hashable {
    enum Kind: String {
        case audio
        case subtitle = "sub"
    }

    let id: Int64
    let kind: Kind
    let title: String
    let language: String?
    let isSelected: Bool

    var displayName: String {
        if !title.isEmpty { return title }
        if let language, !language.isEmpty { return language.uppercased() }
        return "Track \(id)"
    }
}

struct PlaybackProgress: Codable, Equatable {
    let position: Double
    let duration: Double
    let updatedAt: Date

    var resumablePosition: Double? {
        guard duration >= 60, position >= 15, position < duration * 0.92 else { return nil }
        return position
    }
}

@MainActor
final class PlaybackProgressStore {
    private let defaults: UserDefaults
    private let key = "nuvio.tv.playbackProgress.v1"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func progress(for contentID: String) -> PlaybackProgress? {
        load()[contentID]
    }

    func save(contentID: String, position: Double, duration: Double) {
        guard !contentID.isEmpty, duration > 0 else { return }
        var values = load()
        if position >= duration * 0.92 {
            values.removeValue(forKey: contentID)
        } else if position >= 5 {
            values[contentID] = PlaybackProgress(
                position: position,
                duration: duration,
                updatedAt: Date()
            )
        }
        persist(values)
    }

    func clearAll() {
        defaults.removeObject(forKey: key)
    }

    private func load() -> [String: PlaybackProgress] {
        guard let data = defaults.data(forKey: key),
              let values = try? JSONDecoder().decode([String: PlaybackProgress].self, from: data) else {
            return [:]
        }
        return values
    }

    private func persist(_ values: [String: PlaybackProgress]) {
        let newest = values
            .sorted { $0.value.updatedAt > $1.value.updatedAt }
            .prefix(250)
        let limited = Dictionary(uniqueKeysWithValues: newest.map { ($0.key, $0.value) })
        guard let data = try? JSONEncoder().encode(limited) else { return }
        defaults.set(data, forKey: key)
    }
}
