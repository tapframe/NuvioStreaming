import Foundation

@MainActor
final class HomePreferencesStore: ObservableObject {
    @Published private(set) var value: HomePreferences

    private let defaults: UserDefaults
    private let key = "nuvio.tv.home.preferences.v2"
    private var pushTask: Task<Void, Never>?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: key),
           let decoded = try? JSONDecoder().decode(HomePreferences.self, from: data) {
            value = decoded
        } else {
            value = HomePreferences()
        }
    }

    func reconcile(definitions: [HomeCatalogDefinition], collections: [TVCollection]) {
        let keys = definitions.map(\.id) + collections.map { "collection_\($0.id)" }
        var byKey = Dictionary(uniqueKeysWithValues: value.items.map { ($0.key, $0) })
        var nextOrder = (value.items.map(\.order).max() ?? -1) + 1
        for key in keys where byKey[key] == nil {
            byKey[key] = HomeCatalogPreference(key: key, enabled: true, order: nextOrder, customTitle: "")
            nextOrder += 1
        }
        value.items = byKey.values
            .filter { keys.contains($0.key) }
            .sorted { $0.order < $1.order }
            .enumerated()
            .map { index, item in
                var copy = item
                copy.order = index
                return copy
            }
        save()
    }

    func setHeroEnabled(_ enabled: Bool) {
        value.heroEnabled = enabled
        save()
    }

    func setShowCatalogType(_ enabled: Bool) {
        value.showCatalogType = enabled
        save()
    }

    func setHideUnreleasedContent(_ enabled: Bool) {
        value.hideUnreleasedContent = enabled
        save()
    }

    func setEnabled(key: String, enabled: Bool) {
        update(key) { $0.enabled = enabled }
    }

    func move(key: String, direction: Int) {
        var ordered = value.items.sorted { $0.order < $1.order }
        guard let index = ordered.firstIndex(where: { $0.key == key }) else { return }
        let destination = index + direction
        guard ordered.indices.contains(destination) else { return }
        ordered.swapAt(index, destination)
        value.items = ordered.enumerated().map { offset, item in
            var copy = item
            copy.order = offset
            return copy
        }
        save()
    }

    func applyRemote(_ preferences: HomePreferences) {
        let localHeroEnabled = value.heroEnabled
        value = preferences
        value.heroEnabled = localHeroEnabled
        save()
    }

    func clearForLogout() {
        pushTask?.cancel()
        value = HomePreferences()
        defaults.removeObject(forKey: key)
        objectWillChange.send()
    }

    func schedulePush(auth: AuthStore, profileID: Int, service: NuvioAccountService = NuvioAccountService()) {
        guard auth.session != nil else { return }
        pushTask?.cancel()
        let payload = value
        pushTask = Task {
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            do {
                let token = try await auth.validAccessToken()
                try await service.saveHomePreferences(payload, accessToken: token, profileID: profileID)
            } catch {
                AppLog.sync.error("Home preferences push failed profile=\(profileID) detail=\(AppLog.safeDescription(error), privacy: .public)")
            }
        }
    }

    private func update(_ key: String, mutation: (inout HomeCatalogPreference) -> Void) {
        guard let index = value.items.firstIndex(where: { $0.key == key }) else { return }
        mutation(&value.items[index])
        save()
    }

    private func save() {
        defaults.set(try? JSONEncoder().encode(value), forKey: key)
        objectWillChange.send()
    }
}
