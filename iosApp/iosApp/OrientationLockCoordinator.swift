import UIKit
import UserNotifications
import ComposeApp

private let lockPlayerToLandscapeNotification = Notification.Name("NuvioPlayerLockLandscape")
private let unlockPlayerOrientationNotification = Notification.Name("NuvioPlayerUnlockOrientation")

final class OrientationLockAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        OrientationLockCoordinator.shared.start()
        DownloadsLiveActivityManager.shared.start()
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        OrientationLockCoordinator.shared.supportedOrientations
    }

    func application(
        _ application: UIApplication,
        handleEventsForBackgroundURLSession identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        DownloadsPlatformDownloader_iosKt.handleDownloadsBackgroundEvents(
            identifier: identifier,
            completionHandler: completionHandler
        )
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        DownloadsPlatformDownloader_iosKt.pauseDownloadsForAppBackground()
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list, .sound])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        if let deepLink = response.notification.request.content.userInfo["deeplink"] as? String {
            AppUrlBridgeKt.handleAppUrl(url: deepLink)
        }
        completionHandler()
    }
}

final class OrientationLockCoordinator {
    static let shared = OrientationLockCoordinator()

    private(set) var supportedOrientations: UIInterfaceOrientationMask = .allButUpsideDown
    private var observers: [NSObjectProtocol] = []

    private init() {}

    func start() {
        guard observers.isEmpty else { return }

        let center = NotificationCenter.default
        observers.append(
            center.addObserver(forName: lockPlayerToLandscapeNotification, object: nil, queue: .main) { [weak self] _ in
                self?.setLandscapeLock(enabled: true)
            }
        )
        observers.append(
            center.addObserver(forName: unlockPlayerOrientationNotification, object: nil, queue: .main) { [weak self] _ in
                self?.setLandscapeLock(enabled: false)
            }
        )
    }

    private func setLandscapeLock(enabled: Bool) {
        let nextOrientations: UIInterfaceOrientationMask = enabled ? .landscape : .allButUpsideDown
        supportedOrientations = nextOrientations
        requestOrientationUpdate(for: nextOrientations, forceRotate: enabled)
    }

    private func requestOrientationUpdate(for mask: UIInterfaceOrientationMask, forceRotate: Bool) {
        if #available(iOS 16.0, *) {
            let preferences = UIWindowScene.GeometryPreferences.iOS(interfaceOrientations: mask)
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .forEach { scene in
                    scene.requestGeometryUpdate(preferences) { error in
                        print("[OrientationLockCoordinator] Geometry update failed: \(error.localizedDescription)")
                    }
                }
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .forEach { window in
                    window.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
                }
        } else {
            if forceRotate {
                UIDevice.current.setValue(preferredLandscapeOrientation.rawValue, forKey: "orientation")
            } else if UIDevice.current.orientation.isPortrait {
                UIDevice.current.setValue(UIInterfaceOrientation.portrait.rawValue, forKey: "orientation")
            }
            UIViewController.attemptRotationToDeviceOrientation()
        }
    }

    private var preferredLandscapeOrientation: UIInterfaceOrientation {
        if let sceneOrientation = UIApplication.shared.connectedScenes
            .compactMap({ ($0 as? UIWindowScene)?.interfaceOrientation })
            .first(where: \.isLandscape) {
            return sceneOrientation
        }

        switch UIDevice.current.orientation {
        case .landscapeLeft:
            return .landscapeRight
        case .landscapeRight:
            return .landscapeLeft
        default:
            return .landscapeRight
        }
    }
}
