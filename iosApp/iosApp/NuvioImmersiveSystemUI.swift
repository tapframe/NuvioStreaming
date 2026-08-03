import UIKit
import Combine

final class NuvioImmersiveSystemUI: ObservableObject {
    static let shared = NuvioImmersiveSystemUI()

    private init() {}

    private(set) weak var activePlayer: UIViewController?

    @Published private(set) var isPlayerImmersive = false

    func playerDidBecomeVisible(_ player: UIViewController) {
        guard activePlayer !== player else { return }
        activePlayer = player
        publishImmersiveState(true)
        refresh()
    }

    func playerDidBecomeHidden(_ player: UIViewController) {
        guard activePlayer === player || activePlayer == nil else { return }
        activePlayer = nil
        publishImmersiveState(false)
        refresh()
    }

    private func publishImmersiveState(_ immersive: Bool) {
        let apply = { [weak self] in
            guard let self, self.isPlayerImmersive != immersive else { return }
            self.isPlayerImmersive = immersive
        }
        if Thread.isMainThread {
            apply()
        } else {
            DispatchQueue.main.async(execute: apply)
        }
    }

    func refresh() {
        let apply = {
            for scene in UIApplication.shared.connectedScenes {
                guard let windowScene = scene as? UIWindowScene else { continue }
                for window in windowScene.windows {
                    guard let root = window.rootViewController else { continue }
                    Self.markNeedsUpdate(root)
                }
            }
        }

        if Thread.isMainThread {
            apply()
        } else {
            DispatchQueue.main.async(execute: apply)
        }
    }

    private static func markNeedsUpdate(_ controller: UIViewController) {
        controller.setNeedsUpdateOfHomeIndicatorAutoHidden()
        controller.setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
        controller.setNeedsStatusBarAppearanceUpdate()

        for child in controller.children {
            markNeedsUpdate(child)
        }
        if let presented = controller.presentedViewController {
            markNeedsUpdate(presented)
        }
    }
}
