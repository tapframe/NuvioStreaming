import Foundation

@MainActor
final class TVProfileStore: ObservableObject {
    @Published private(set) var profiles: [TVProfile] = []
    @Published private(set) var activeProfileID: Int

    private let defaults: UserDefaults
    private let key = "nuvio.tv.activeProfile.v1"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let saved = defaults.integer(forKey: key)
        activeProfileID = saved > 0 ? saved : 1
    }

    var activeProfile: TVProfile? {
        profiles.first { $0.profileIndex == activeProfileID }
    }

    func sync(auth: AuthStore, service: NuvioAccountService = NuvioAccountService()) async {
        guard auth.session != nil else { return }
        do {
            let token = try await auth.validAccessToken()
            profiles = try await service.profiles(accessToken: token).sorted { $0.profileIndex < $1.profileIndex }
            if !profiles.contains(where: { $0.profileIndex == activeProfileID }), let first = profiles.first {
                select(first.profileIndex)
            }
        } catch {
            let detail = AppLog.safeDescription(error)
            AppLog.sync.error("Profile sync failed detail=\(detail, privacy: .public)")
        }
    }

    func select(_ profileID: Int) {
        guard profileID > 0 else { return }
        activeProfileID = profileID
        defaults.set(profileID, forKey: key)
    }

    func clear() {
        profiles = []
        activeProfileID = 1
        defaults.removeObject(forKey: key)
    }
}
