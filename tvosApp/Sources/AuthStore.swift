import CoreImage.CIFilterBuiltins
import SwiftUI

@MainActor
final class AuthStore: ObservableObject {
    @Published private(set) var status: AuthStatus = .loading
    @Published private(set) var qrSession: TVLoginStart?
    @Published private(set) var qrImage: UIImage?
    @Published private(set) var message: String?
    @Published private(set) var isWorking = false

    private let defaults: UserDefaults
    private let service: NuvioAccountService
    private let sessionStorage: any AuthSessionStorage
    private let guestKey = "nuvio.tv.continueAsGuest.v1"
    private var nonce: String?
    private var pollingTask: Task<Void, Never>?

    init(
        defaults: UserDefaults = .standard,
        service: NuvioAccountService = NuvioAccountService(),
        sessionStorage: any AuthSessionStorage = KeychainAuthSessionStorage()
    ) {
        self.defaults = defaults
        self.service = service
        self.sessionStorage = sessionStorage
        Task { await restore() }
    }

    var session: AuthSession? {
        guard case .authenticated(let session) = status else { return nil }
        return session
    }

    var signedInEmail: String? { session?.user.email }

    func continueAsGuest() {
        pollingTask?.cancel()
        defaults.set(true, forKey: guestKey)
        status = .guest
        clearQR()
    }

    func showSignIn() {
        defaults.set(false, forKey: guestKey)
        status = .signedOut
        if qrSession == nil { Task { await startQRLogin() } }
    }

    func signIn(email: String, password: String) async {
        await perform {
            let response = try await service.signIn(email: email, password: password)
            try await accept(response)
        }
    }

    func startQRLogin() async {
        pollingTask?.cancel()
        clearQR()
        await perform(showSpinner: qrSession == nil) {
            let nonce = randomNonce()
            self.nonce = nonce
            let result = try await service.startTVLogin(nonce: nonce, deviceName: "Apple TV")
            qrSession = result
            qrImage = qrCode(from: result.webURL)
            message = "Scan with your phone to sign in."
            startPolling(code: result.code, nonce: nonce, interval: result.pollIntervalSeconds)
        }
    }

    func logout() async {
        pollingTask?.cancel()
        let current = session
        clearLocalSession()
        status = .signedOut
        if let current {
            try? await service.signOut(accessToken: current.accessToken)
        }
        await startQRLogin()
    }

    func validAccessToken() async throws -> String {
        guard var current = session else { throw AuthError.missingUser }
        if current.needsRefresh {
            let response = try await service.refresh(token: current.refreshToken)
            let user = response.user ?? current.user
            current = response.session(user: user)
            save(current)
            status = .authenticated(current)
        }
        return current.accessToken
    }

    private func restore() async {
        if let saved = sessionStorage.load() {
            do {
                var active = saved
                if active.needsRefresh {
                    let response = try await service.refresh(token: active.refreshToken)
                    active = response.session(user: response.user ?? active.user)
                }
                let user = try await service.user(accessToken: active.accessToken)
                active = AuthSession(
                    accessToken: active.accessToken,
                    refreshToken: active.refreshToken,
                    tokenType: active.tokenType,
                    expiresAt: active.expiresAt,
                    user: user
                )
                save(active)
                status = .authenticated(active)
                return
            } catch {
                clearLocalSession()
            }
        }
        if defaults.bool(forKey: guestKey) {
            status = .guest
        } else {
            status = .signedOut
            await startQRLogin()
        }
    }

    private func accept(_ response: TokenResponse) async throws {
        let user = try await resolvedUser(for: response)
        let active = response.session(user: user)
        save(active)
        defaults.set(false, forKey: guestKey)
        pollingTask?.cancel()
        clearQR()
        status = .authenticated(active)
    }

    private func resolvedUser(for response: TokenResponse) async throws -> AuthUser {
        if let user = response.user, !user.id.isEmpty, !user.email.isEmpty { return user }
        return try await service.user(accessToken: response.accessToken)
    }

    private func startPolling(code: String, nonce: String, interval: Int) {
        pollingTask = Task { [weak self] in
            var delaySeconds = max(2, interval)
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(delaySeconds))
                guard !Task.isCancelled, let self else { return }
                do {
                    let result = try await service.pollTVLogin(code: code, nonce: nonce)
                    delaySeconds = max(2, result.pollIntervalSeconds ?? delaySeconds)
                    switch result.status.lowercased() {
                    case "approved":
                        message = "Approved. Signing in..."
                        let response = try await service.exchangeTVLogin(code: code, nonce: nonce)
                        try await accept(response)
                        return
                    case "expired", "used", "cancelled":
                        message = result.status.lowercased() == "expired" ? AuthError.expiredCode.localizedDescription : "Sign-in was cancelled."
                        return
                    default:
                        message = "Waiting for approval..."
                    }
                } catch {
                    message = error.localizedDescription
                    return
                }
            }
        }
    }

    private func perform(showSpinner: Bool = true, _ action: () async throws -> Void) async {
        if showSpinner { isWorking = true }
        message = nil
        do { try await action() } catch { message = error.localizedDescription }
        isWorking = false
    }

    private func save(_ session: AuthSession) {
        do {
            try sessionStorage.save(session)
        } catch {
            AppLog.account.error("Account session could not be stored securely")
        }
    }

    private func clearLocalSession() {
        sessionStorage.clear()
        defaults.set(false, forKey: guestKey)
    }

    private func clearQR() {
        qrSession = nil
        qrImage = nil
        nonce = nil
        message = nil
    }

    private func randomNonce() -> String {
        var bytes = [UInt8](repeating: 0, count: 24)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private func qrCode(from string: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 12, y: 12)),
              let cgImage = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
