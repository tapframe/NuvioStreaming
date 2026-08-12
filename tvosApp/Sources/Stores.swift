import Foundation

@MainActor
final class LibraryStore: ObservableObject {
    @Published private(set) var items: [MetaSummary] = []

    private let defaults: UserDefaults
    private let key = "nuvio.tv.library.v1"
    private var accountContext: (auth: AuthStore, profileID: Int)?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        load()
    }

    func contains(_ id: String) -> Bool {
        items.contains { $0.id == id }
    }

    func toggle(_ item: MetaSummary) {
        let removed: Bool
        if let index = items.firstIndex(where: { $0.id == item.id && $0.type == item.type }) {
            items.remove(at: index)
            removed = true
        } else {
            items.insert(item, at: 0)
            removed = false
        }
        save()
        Task { await pushMutation(item, removed: removed) }
    }

    func clearForLogout() {
        items = []
        accountContext = nil
        defaults.removeObject(forKey: key)
    }

    func syncFromAccount(auth: AuthStore, profileID: Int, service: NuvioAccountService = NuvioAccountService()) async {
        guard auth.session != nil else { return }
        accountContext = (auth, profileID)
        do {
            let token = try await auth.validAccessToken()
            items = try await service.library(accessToken: token, profileID: profileID).map(\.summary)
            save()
        } catch {
            AppLog.sync.error("Library sync failed profile=\(profileID) detail=\(AppLog.safeDescription(error), privacy: .public)")
        }
    }

    private func pushMutation(_ item: MetaSummary, removed: Bool) async {
        guard let context = accountContext else { return }
        do {
            let token = try await context.auth.validAccessToken()
            let service = NuvioAccountService()
            if removed {
                try await service.deleteLibraryItem(item, accessToken: token, profileID: context.profileID)
            } else {
                try await service.saveLibraryItem(item, accessToken: token, profileID: context.profileID)
            }
        } catch {
            AppLog.sync.error("Library mutation push failed profile=\(context.profileID) detail=\(AppLog.safeDescription(error), privacy: .public)")
        }
    }

    private func load() {
        guard let data = defaults.data(forKey: key),
              let decoded = try? JSONDecoder().decode([MetaSummary].self, from: data) else { return }
        items = decoded
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(items) else { return }
        defaults.set(data, forKey: key)
    }
}

@MainActor
final class AddonStore: ObservableObject {
    @Published private(set) var addons: [AddonEndpoint] = []
    @Published private(set) var homeAddons: [HomeAddon] = []
    @Published private(set) var isRefreshing = false
    @Published private(set) var syncMessage: String?

    private let defaults: UserDefaults
    private let service: StremioService
    private let accountService: NuvioAccountService
    private let key = "nuvio.tv.addonBases.v1"
    private var storedBases: [String]
    private var accountContext: (auth: AuthStore, profileID: Int)?

    init(
        defaults: UserDefaults = .standard,
        service: StremioService = StremioService(),
        accountService: NuvioAccountService = NuvioAccountService()
    ) {
        self.defaults = defaults
        self.service = service
        self.accountService = accountService
        storedBases = defaults.stringArray(forKey: key) ?? []
        addons = storedBases.map {
            AddonEndpoint(baseURL: $0, name: URL(string: $0)?.host ?? "Saved addon", detail: nil, providesStreams: true)
        }
        homeAddons = []
    }

    func syncFromAccount(auth: AuthStore, profileID: Int = 1) async {
        accountContext = (auth, profileID)
        syncMessage = "Syncing account addons..."
        do {
            let token = try await auth.validAccessToken()
            let owner = try await accountService.effectiveOwner(accessToken: token)
            let remote = try await accountService.addons(
                accessToken: token,
                ownerID: owner,
                profileID: profileID
            )
                .filter(\.enabled)
                .sorted { $0.sortOrder < $1.sortOrder }
            let remoteURLs = remote.map(\.url)
            if remoteURLs.isEmpty, !storedBases.isEmpty {
                await pushToAccount()
            } else {
                storedBases = remoteURLs
                persist()
            }
            await refreshManifests()
            syncMessage = "Synced \(remoteURLs.count) account addon\(remoteURLs.count == 1 ? "" : "s")."
        } catch {
            let detail = AppLog.safeDescription(error)
            AppLog.sync.error("Addon sync failed profile=\(profileID) detail=\(detail, privacy: .public)")
            syncMessage = "Addon sync failed: \(detail)"
        }
    }

    func clearForLogout() {
        storedBases = []
        addons = []
        homeAddons = []
        syncMessage = nil
        accountContext = nil
        persist()
    }

    func add(manifestURL: String) async throws {
        let result = try await service.manifest(at: manifestURL)
        let base = result.base.absoluteString
        let endpoint = AddonEndpoint(
            baseURL: base,
            name: result.manifest.name,
            detail: result.manifest.description,
            providesStreams: result.manifest.providesStreams,
            manifest: result.manifest
        )
        let homeAddon = HomeAddon(baseURL: base, name: result.manifest.name, manifest: result.manifest)
        if let index = addons.firstIndex(where: { $0.baseURL == base }) {
            addons[index] = endpoint
            if let homeIndex = homeAddons.firstIndex(where: { $0.baseURL == base }) {
                homeAddons[homeIndex] = homeAddon
            } else {
                homeAddons.append(homeAddon)
            }
        } else {
            addons.append(endpoint)
            homeAddons.append(homeAddon)
        }
        storedBases = addons.map(\.baseURL)
        persist()
        await pushToAccount()
    }

    func remove(_ addon: AddonEndpoint) async {
        addons.removeAll { $0.baseURL == addon.baseURL }
        homeAddons.removeAll { $0.baseURL == addon.baseURL }
        storedBases = addons.map(\.baseURL)
        persist()
        await pushToAccount()
    }

    func refreshManifests() async {
        guard !storedBases.isEmpty else { return }
        isRefreshing = true
        defer { isRefreshing = false }

        var refreshed: [AddonEndpoint] = []
        var refreshedHomeAddons: [HomeAddon] = []
        for base in storedBases {
            do {
                let result = try await service.manifest(at: base)
                refreshed.append(AddonEndpoint(
                    baseURL: result.base.absoluteString,
                    name: result.manifest.name,
                    detail: result.manifest.description,
                    providesStreams: result.manifest.providesStreams,
                    manifest: result.manifest
                ))
                refreshedHomeAddons.append(HomeAddon(
                    baseURL: result.base.absoluteString,
                    name: result.manifest.name,
                    manifest: result.manifest
                ))
            } catch {
                let detail = AppLog.safeDescription(error)
                AppLog.provider.error("Manifest refresh failed base=\(Self.safeEndpointLabel(base), privacy: .public) detail=\(detail, privacy: .public)")
                refreshed.append(AddonEndpoint(
                    baseURL: base,
                    name: URL(string: base)?.host ?? "Unavailable addon",
                    detail: "Could not refresh this manifest.",
                    providesStreams: true,
                    manifest: nil
                ))
            }
        }
        addons = refreshed
        homeAddons = refreshedHomeAddons
    }

    private func pushToAccount() async {
        guard let context = accountContext else { return }
        do {
            let token = try await context.auth.validAccessToken()
            try await accountService.saveAddons(addons, accessToken: token, profileID: context.profileID)
        } catch {
            AppLog.sync.error("Addon push failed profile=\(context.profileID) detail=\(AppLog.safeDescription(error), privacy: .public)")
        }
    }

    private static func safeEndpointLabel(_ value: String) -> String {
        URL(string: value)?.host ?? "invalid-host"
    }

    private func persist() {
        defaults.set(storedBases, forKey: key)
    }
}
