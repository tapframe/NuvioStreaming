import Foundation

@MainActor
final class CollectionStore: ObservableObject {
    @Published private(set) var collections: [TVCollection] = []
    @Published private(set) var message: String?

    private let accountService: NuvioAccountService

    init(accountService: NuvioAccountService = NuvioAccountService()) {
        self.accountService = accountService
    }

    func sync(auth: AuthStore, profileID: Int) async {
        guard auth.session != nil else {
            collections = []
            return
        }
        let startMessage = "collections.start profile=\(profileID)"
        AppLog.sync.notice("\(startMessage, privacy: .public)")
        AppLog.console(startMessage)
        do {
            let token = try await auth.validAccessToken()
            collections = try await accountService.collections(accessToken: token, profileID: profileID)
                .sorted { first, second in
                    if first.pinToTop != second.pinToTop { return first.pinToTop }
                    return first.title.localizedCaseInsensitiveCompare(second.title) == .orderedAscending
                }
            message = nil
            let successMessage = "collections.complete profile=\(profileID) count=\(self.collections.count)"
            AppLog.sync.notice("\(successMessage, privacy: .public)")
            AppLog.console(successMessage)
        } catch {
            let detail = AppLog.safeDescription(error)
            let failureMessage = "collections.fail profile=\(profileID) detail=\(detail)"
            AppLog.sync.error("\(failureMessage, privacy: .public)")
            AppLog.console(failureMessage)
            message = "Collections could not be synchronized. \(detail)"
        }
    }

    func clearForLogout() {
        collections = []
        message = nil
    }

    func items(
        for folder: TVCollectionFolder,
        addons: [HomeAddon],
        service: StremioService = StremioService()
    ) async -> [MetaSummary] {
        var loaded: [MetaSummary] = []
        for source in folder.sources where source.provider.lowercased() == "addon" {
            guard let addonID = source.addonId,
                  let addon = addons.first(where: { $0.manifest.id == addonID }),
                  let type = source.type,
                  let catalogID = source.catalogId else { continue }
            let items: [MetaSummary]
            do {
                items = try await service.catalog(
                    baseURL: addon.baseURL,
                    type: type,
                    id: catalogID,
                    genre: source.genre
                ).map { $0.withMetadataBaseURL(addon.baseURL) }
            } catch {
                let detail = AppLog.safeDescription(error)
                AppLog.provider.error("Collection catalog failed folder=\(folder.id, privacy: .public) addon=\(addon.manifest.id, privacy: .public) type=\(type, privacy: .public) catalog=\(catalogID, privacy: .public) detail=\(detail, privacy: .public)")
                continue
            }
            loaded.append(contentsOf: items)
        }
        var seen = Set<String>()
        return loaded.filter { seen.insert("\($0.type):\($0.id)").inserted }
    }
}
