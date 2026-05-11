import UIKit
import SwiftUI
import ComposeApp

private enum NuvioNativeTabIcon {
    static let home = vectorIcon(
        viewport: CGSize(width: 24, height: 24),
        paths: [
            "M10,20V14H14V20H19V12H22L12,3L2,12H5V20Z",
        ]
    )

    static let search = drawnIcon { context, rect in
        drawInViewport(context: context, rect: rect, viewport: CGSize(width: 20, height: 20)) {
            context.setStrokeColor(UIColor.black.cgColor)
            context.setLineWidth(2)
            context.setLineCap(.round)
            context.strokeEllipse(in: CGRect(x: 3, y: 3, width: 12, height: 12))
            context.move(to: CGPoint(x: 13.6, y: 13.6))
            context.addLine(to: CGPoint(x: 17, y: 17))
            context.strokePath()
        }
    }

    static let library = vectorIcon(
        viewport: CGSize(width: 24, height: 24),
        paths: [
            "M8.50989,2.00001H15.49C15.7225,1.99995 15.9007,1.99991 16.0565,2.01515C17.1643,2.12352 18.0711,2.78958 18.4556,3.68678H5.54428C5.92879,2.78958 6.83555,2.12352 7.94337,2.01515C8.09917,1.99991 8.27741,1.99995 8.50989,2.00001Z",
            "M6.31052,4.72312C4.91989,4.72312 3.77963,5.56287 3.3991,6.67691C3.39117,6.70013 3.38356,6.72348 3.37629,6.74693C3.77444,6.62636 4.18881,6.54759 4.60827,6.49382C5.68865,6.35531 7.05399,6.35538 8.64002,6.35547L8.75846,6.35547L15.5321,6.35547C17.1181,6.35538 18.4835,6.35531 19.5639,6.49382C19.9833,6.54759 20.3977,6.62636 20.7958,6.74693C20.7886,6.72348 20.781,6.70013 20.773,6.67691C20.3925,5.56287 19.2522,4.72312 17.8616,4.72312H6.31052Z",
            "M8.67239,7.54204H15.3276C18.7024,7.54204 20.3898,7.54204 21.3377,8.52887C22.2855,9.5157 22.0625,11.0403 21.6165,14.0896L21.1935,16.9811C20.8437,19.3724 20.6689,20.568 19.7717,21.284C18.8745,22 17.5512,22 14.9046,22H9.09536C6.44881,22 5.12553,22 4.22834,21.284C3.33115,20.568 3.15626,19.3724 2.80648,16.9811L2.38351,14.0896C1.93748,11.0403 1.71447,9.5157 2.66232,8.52887C3.61017,7.54204 5.29758,7.54204 8.67239,7.54204ZM8,18.0001C8,17.5859 8.3731,17.2501 8.83333,17.2501H15.1667C15.6269,17.2501 16,17.5859 16,18.0001C16,18.4144 15.6269,18.7502 15.1667,18.7502H8.83333C8.3731,18.7502 8,18.4144 8,18.0001Z",
        ]
    )

    static let profileFallback = vectorIcon(
        viewport: CGSize(width: 24, height: 24),
        paths: [
            "M12,12C14.21,12 16,10.21 16,8C16,5.79 14.21,4 12,4C9.79,4 8,5.79 8,8C8,10.21 9.79,12 12,12ZM12,14C9.33,14 4,15.34 4,18V19C4,19.55 4.45,20 5,20H19C19.55,20 20,19.55 20,19V18C20,15.34 14.67,14 12,14Z",
        ]
    )

    static func profileAvatar(
        name: String?,
        avatarColor: UIColor?,
        backgroundColor: UIColor?,
        avatarImage: UIImage?,
        selected: Bool,
        accent: UIColor
    ) -> UIImage {
        guard name != nil || avatarColor != nil || avatarImage != nil else {
            return profileFallback
        }

        let size = CGSize(width: 28, height: 28)
        let baseColor = avatarColor ?? UIColor(red: 30.0 / 255.0, green: 136.0 / 255.0, blue: 229.0 / 255.0, alpha: 1)
        let fillColor = backgroundColor ?? baseColor.withAlphaComponent(0.15)
        let borderColor = selected ? accent : baseColor.withAlphaComponent(0.5)
        let initial = name?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .prefix(1)
            .uppercased() ?? ""

        return UIGraphicsImageRenderer(size: size).image { _ in
            let rect = CGRect(origin: .zero, size: size).insetBy(dx: 1, dy: 1)
            fillColor.setFill()
            UIBezierPath(ovalIn: rect).fill()

            if let avatarImage {
                UIBezierPath(ovalIn: rect).addClip()
                drawAspectFill(image: avatarImage, in: rect)
            } else if !initial.isEmpty {
                let font = UIFont.systemFont(ofSize: size.height * 0.45, weight: .bold)
                let attributes: [NSAttributedString.Key: Any] = [
                    .font: font,
                    .foregroundColor: baseColor,
                ]
                let textSize = initial.size(withAttributes: attributes)
                initial.draw(
                    at: CGPoint(
                        x: rect.midX - textSize.width / 2,
                        y: rect.midY - textSize.height / 2
                    ),
                    withAttributes: attributes
                )
            } else {
                profileFallback
                    .withTintColor(baseColor, renderingMode: .alwaysOriginal)
                    .draw(in: rect.insetBy(dx: 5.5, dy: 5.5))
            }

            borderColor.setStroke()
            let borderPath = UIBezierPath(ovalIn: rect.insetBy(dx: 0.75, dy: 0.75))
            borderPath.lineWidth = 1.5
            borderPath.stroke()
        }.withRenderingMode(.alwaysOriginal)
    }

    private static func drawInViewport(
        context: CGContext,
        rect: CGRect,
        viewport: CGSize,
        draw: () -> Void
    ) {
        let scale = min(rect.width / viewport.width, rect.height / viewport.height)
        let x = rect.midX - viewport.width * scale / 2
        let y = rect.midY - viewport.height * scale / 2
        context.saveGState()
        context.translateBy(x: x, y: y)
        context.scaleBy(x: scale, y: scale)
        draw()
        context.restoreGState()
    }

    private static func vectorIcon(viewport: CGSize, paths: [String], size: CGSize = CGSize(width: 25, height: 25)) -> UIImage {
        drawnIcon(size: size) { context, rect in
            drawInViewport(context: context, rect: rect, viewport: viewport) {
                context.setFillColor(UIColor.black.cgColor)
                paths.compactMap { SVGPath(data: $0).cgPath }.forEach { path in
                    context.addPath(path)
                    context.fillPath(using: .evenOdd)
                }
            }
        }
    }

    private static func drawnIcon(
        size: CGSize = CGSize(width: 25, height: 25),
        draw: @escaping (CGContext, CGRect) -> Void
    ) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { rendererContext in
            draw(rendererContext.cgContext, CGRect(origin: .zero, size: size))
        }.withRenderingMode(.alwaysTemplate)
    }

    private static func drawAspectFill(image: UIImage, in rect: CGRect) {
        guard image.size.width > 0, image.size.height > 0 else { return }
        let scale = max(rect.width / image.size.width, rect.height / image.size.height)
        let drawSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let drawRect = CGRect(
            x: rect.midX - drawSize.width / 2,
            y: rect.midY - drawSize.height / 2,
            width: drawSize.width,
            height: drawSize.height
        )
        image.draw(in: drawRect)
    }

    private struct SVGPath {
        private enum Token {
            case command(Character)
            case number(CGFloat)
        }

        let data: String

        var cgPath: CGPath? {
            let tokens = Self.tokens(from: data)
            var index = 0
            var command: Character?
            var current = CGPoint.zero
            var subpathStart = CGPoint.zero
            let path = CGMutablePath()

            func hasNumber() -> Bool {
                guard index < tokens.count else { return false }
                if case .number = tokens[index] { return true }
                return false
            }

            func readNumber() -> CGFloat? {
                guard index < tokens.count else { return nil }
                guard case let .number(value) = tokens[index] else { return nil }
                index += 1
                return value
            }

            func readPoint(relative: Bool) -> CGPoint? {
                guard let x = readNumber(), let y = readNumber() else { return nil }
                let point = CGPoint(x: x, y: y)
                return relative ? CGPoint(x: current.x + point.x, y: current.y + point.y) : point
            }

            while index < tokens.count {
                if case let .command(value) = tokens[index] {
                    command = value
                    index += 1
                }

                guard let activeCommand = command else { return nil }
                let relative = activeCommand.isLowercase

                switch activeCommand.uppercased() {
                case "M":
                    guard let point = readPoint(relative: relative) else { return nil }
                    path.move(to: point)
                    current = point
                    subpathStart = point
                    command = relative ? "l" : "L"
                case "L":
                    while hasNumber() {
                        guard let point = readPoint(relative: relative) else { return nil }
                        path.addLine(to: point)
                        current = point
                    }
                case "H":
                    while hasNumber() {
                        guard let x = readNumber() else { return nil }
                        let point = CGPoint(x: relative ? current.x + x : x, y: current.y)
                        path.addLine(to: point)
                        current = point
                    }
                case "V":
                    while hasNumber() {
                        guard let y = readNumber() else { return nil }
                        let point = CGPoint(x: current.x, y: relative ? current.y + y : y)
                        path.addLine(to: point)
                        current = point
                    }
                case "C":
                    while hasNumber() {
                        guard
                            let c1 = readPoint(relative: relative),
                            let c2 = readPoint(relative: relative),
                            let end = readPoint(relative: relative)
                        else { return nil }
                        path.addCurve(to: end, control1: c1, control2: c2)
                        current = end
                    }
                case "Z":
                    path.closeSubpath()
                    current = subpathStart
                default:
                    return nil
                }
            }

            return path
        }

        private static func tokens(from data: String) -> [Token] {
            let pattern = "[MmLlHhVvCcZz]|[-+]?(?:\\d*\\.\\d+|\\d+\\.?)(?:[eE][-+]?\\d+)?"
            guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
            let range = NSRange(data.startIndex..<data.endIndex, in: data)
            return regex.matches(in: data, range: range).compactMap { match in
                guard let tokenRange = Range(match.range, in: data) else { return nil }
                let token = String(data[tokenRange])
                if token.count == 1, let character = token.first, character.isLetter {
                    return .command(character)
                }
                guard let value = Double(token) else { return nil }
                return .number(CGFloat(value))
            }
        }
    }
}

final class RootComposeViewController: UIViewController, UITabBarDelegate {
    private enum NativeTab: String, CaseIterable {
        case home = "Home"
        case search = "Search"
        case library = "Library"
        case settings = "Settings"

        var tag: Int {
            switch self {
            case .home: return 0
            case .search: return 1
            case .library: return 2
            case .settings: return 3
            }
        }

        var title: String {
            switch self {
            case .home: return "Home"
            case .search: return "Search"
            case .library: return "Library"
            case .settings: return "Profile"
            }
        }

        var iconImage: UIImage {
            switch self {
            case .home: return NuvioNativeTabIcon.home
            case .search: return NuvioNativeTabIcon.search
            case .library: return NuvioNativeTabIcon.library
            case .settings: return NuvioNativeTabIcon.profileFallback
            }
        }

        init?(tag: Int) {
            guard let tab = Self.allCases.first(where: { $0.tag == tag }) else { return nil }
            self = tab
        }
    }

    private static let liquidGlassEnabledKey = "NuvioLiquidGlassNativeTabBarEnabled"
    private static let nativeTabBarVisibleKey = "NuvioNativeTabBarVisible"
    private static let nativeSelectedTabKey = "NuvioNativeSelectedTab"
    private static let nativeTabAccentColorKey = "NuvioNativeTabAccentColor"
    private static let nativeProfileNameKey = "NuvioNativeProfileName"
    private static let nativeProfileAvatarColorKey = "NuvioNativeProfileAvatarColor"
    private static let nativeProfileAvatarURLKey = "NuvioNativeProfileAvatarURL"
    private static let nativeProfileAvatarBackgroundColorKey = "NuvioNativeProfileAvatarBackgroundColor"
    private static let nativeTabChromeDidChangeNotification = Notification.Name("NuvioNativeTabChromeDidChange")

    private let contentController: UIViewController
    private let tabBar = UITabBar()
    private var contentBottomToViewBottom: NSLayoutConstraint?
    private var tabBarHeightConstraint: NSLayoutConstraint?
    private var userDefaultsObserver: NSObjectProtocol?
    private var tabChromeObserver: NSObjectProtocol?
    private var profileAvatarImageURL: String?
    private var profileAvatarImageTask: URLSessionDataTask?
    private var profileAvatarImage: UIImage?

    init(contentController: UIViewController) {
        self.contentController = contentController
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = .black
        contentController.view.backgroundColor = .black
        UserDefaults.standard.set(false, forKey: Self.nativeTabBarVisibleKey)

        addChild(contentController)
        view.addSubview(contentController.view)
        contentController.view.translatesAutoresizingMaskIntoConstraints = false
        let bottomToViewBottom = contentController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        self.contentBottomToViewBottom = bottomToViewBottom
        NSLayoutConstraint.activate([
            contentController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            contentController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            contentController.view.topAnchor.constraint(equalTo: view.topAnchor),
            bottomToViewBottom,
        ])
        contentController.didMove(toParent: self)

        configureNativeTabBar()
        installNativeTabObservers()
        syncNativeTabChrome(animated: false)
    }

    deinit {
        if let userDefaultsObserver {
            NotificationCenter.default.removeObserver(userDefaultsObserver)
        }
        if let tabChromeObserver {
            NotificationCenter.default.removeObserver(tabChromeObserver)
        }
        profileAvatarImageTask?.cancel()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        updateTabBarHeight()
    }

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard let tab = NativeTab(tag: item.tag) else { return }
        UserDefaults.standard.set(tab.rawValue, forKey: Self.nativeSelectedTabKey)
        NativeTabBridgeKt.nativeTabSelect(tabName: tab.rawValue)
    }

    override var childForHomeIndicatorAutoHidden: UIViewController? {
        immersiveController(in: contentController) ?? contentController
    }

    override var childForScreenEdgesDeferringSystemGestures: UIViewController? {
        immersiveController(in: contentController) ?? contentController
    }

    override var childForStatusBarHidden: UIViewController? {
        immersiveController(in: contentController) ?? contentController
    }

    override var prefersHomeIndicatorAutoHidden: Bool {
        immersiveController(in: contentController)?.prefersHomeIndicatorAutoHidden ?? false
    }

    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge {
        immersiveController(in: contentController)?.preferredScreenEdgesDeferringSystemGestures ?? []
    }

    override var prefersStatusBarHidden: Bool {
        immersiveController(in: contentController)?.prefersStatusBarHidden ?? false
    }

    override var preferredStatusBarUpdateAnimation: UIStatusBarAnimation {
        .fade
    }

    func refreshImmersiveSystemUI() {
        setNeedsUpdateOfHomeIndicatorAutoHidden()
        setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
        setNeedsStatusBarAppearanceUpdate()
    }

    private func immersiveController(in controller: UIViewController?) -> UIViewController? {
        guard let controller else { return nil }

        if controller.prefersHomeIndicatorAutoHidden ||
            !controller.preferredScreenEdgesDeferringSystemGestures.isEmpty ||
            controller.prefersStatusBarHidden {
            return controller
        }

        if let presented = immersiveController(in: controller.presentedViewController) {
            return presented
        }

        for child in controller.children.reversed() {
            if let immersiveChild = immersiveController(in: child) {
                return immersiveChild
            }
        }

        return nil
    }

    private var nativeTabsSupported: Bool {
        UIDevice.current.userInterfaceIdiom == .phone &&
            ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 26
    }

    private var shouldShowNativeTabBar: Bool {
        nativeTabsSupported &&
            UserDefaults.standard.bool(forKey: Self.liquidGlassEnabledKey) &&
            UserDefaults.standard.bool(forKey: Self.nativeTabBarVisibleKey)
    }

    private func configureNativeTabBar() {
        tabBar.delegate = self
        tabBar.translatesAutoresizingMaskIntoConstraints = false
        tabBar.items = NativeTab.allCases.map { tab in
            let item = UITabBarItem(
                title: tab.title,
                image: tab.iconImage,
                selectedImage: tab.iconImage
            )
            item.tag = tab.tag
            return item
        }
        tabBar.selectedItem = tabBar.items?.first
        applyNativeTabBarAppearance()
        tabBar.alpha = 0
        tabBar.isHidden = true

        view.addSubview(tabBar)
        let heightConstraint = tabBar.heightAnchor.constraint(equalToConstant: tabBarHeight)
        tabBarHeightConstraint = heightConstraint
        NSLayoutConstraint.activate([
            tabBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tabBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            heightConstraint,
        ])
    }

    private func installNativeTabObservers() {
        userDefaultsObserver = NotificationCenter.default.addObserver(
            forName: UserDefaults.didChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.syncNativeTabChrome(animated: true)
        }

        tabChromeObserver = NotificationCenter.default.addObserver(
            forName: Self.nativeTabChromeDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.syncNativeTabChrome(animated: true)
        }
    }

    private var tabBarHeight: CGFloat {
        49 + view.safeAreaInsets.bottom
    }

    private func updateTabBarHeight() {
        tabBarHeightConstraint?.constant = tabBarHeight
    }

    private func syncNativeTabChrome(animated: Bool) {
        updateTabBarHeight()
        applyNativeTabBarAppearance()
        syncSelectedNativeTab()

        let visible = shouldShowNativeTabBar
        contentBottomToViewBottom?.isActive = true
        if visible {
            tabBar.isHidden = false
        }

        let changes = {
            self.tabBar.alpha = visible ? 1 : 0
            self.view.layoutIfNeeded()
        }

        let completion: (Bool) -> Void = { _ in
            self.tabBar.isHidden = !visible
        }

        if animated && view.window != nil {
            UIView.animate(
                withDuration: 0.22,
                delay: 0,
                options: [.beginFromCurrentState, .curveEaseInOut],
                animations: changes,
                completion: completion
            )
        } else {
            changes()
            completion(true)
        }
    }

    private func syncSelectedNativeTab() {
        let rawValue = UserDefaults.standard.string(forKey: Self.nativeSelectedTabKey) ?? NativeTab.home.rawValue
        let selectedTab = NativeTab(rawValue: rawValue) ?? .home
        tabBar.selectedItem = tabBar.items?.first(where: { $0.tag == selectedTab.tag })
    }

    private func applyNativeTabBarAppearance() {
        let accent = UIColor(hexString: UserDefaults.standard.string(forKey: Self.nativeTabAccentColorKey)) ??
            UIColor(red: 0.96, green: 0.96, blue: 0.96, alpha: 1)
        let unselected = UIColor(red: 150 / 255, green: 156 / 255, blue: 163 / 255, alpha: 1)

        refreshProfileAvatarImageIfNeeded()
        updateNativeTabImages(accent: accent)

        tabBar.tintColor = accent
        tabBar.unselectedItemTintColor = unselected

        let appearance = tabBar.standardAppearance.copy() as! UITabBarAppearance
        appearance.stackedLayoutAppearance.normal.iconColor = unselected
        appearance.stackedLayoutAppearance.normal.titleTextAttributes = [.foregroundColor: unselected]
        appearance.stackedLayoutAppearance.selected.iconColor = accent
        appearance.stackedLayoutAppearance.selected.titleTextAttributes = [.foregroundColor: accent]
        appearance.inlineLayoutAppearance.normal.iconColor = unselected
        appearance.inlineLayoutAppearance.normal.titleTextAttributes = [.foregroundColor: unselected]
        appearance.inlineLayoutAppearance.selected.iconColor = accent
        appearance.inlineLayoutAppearance.selected.titleTextAttributes = [.foregroundColor: accent]
        appearance.compactInlineLayoutAppearance.normal.iconColor = unselected
        appearance.compactInlineLayoutAppearance.normal.titleTextAttributes = [.foregroundColor: unselected]
        appearance.compactInlineLayoutAppearance.selected.iconColor = accent
        appearance.compactInlineLayoutAppearance.selected.titleTextAttributes = [.foregroundColor: accent]
        tabBar.standardAppearance = appearance
        tabBar.scrollEdgeAppearance = appearance
    }

    private func updateNativeTabImages(accent: UIColor) {
        tabBar.items?.forEach { item in
            guard let tab = NativeTab(tag: item.tag) else { return }
            item.image = nativeTabImage(for: tab, selected: false, accent: accent)
            item.selectedImage = nativeTabImage(for: tab, selected: true, accent: accent)
        }
    }

    private func nativeTabImage(for tab: NativeTab, selected: Bool, accent: UIColor) -> UIImage {
        guard tab == .settings else {
            return tab.iconImage
        }

        let defaults = UserDefaults.standard
        return NuvioNativeTabIcon.profileAvatar(
            name: defaults.string(forKey: Self.nativeProfileNameKey),
            avatarColor: UIColor(hexString: defaults.string(forKey: Self.nativeProfileAvatarColorKey)),
            backgroundColor: UIColor(hexString: defaults.string(forKey: Self.nativeProfileAvatarBackgroundColorKey)),
            avatarImage: profileAvatarImage,
            selected: selected,
            accent: accent
        )
    }

    private func refreshProfileAvatarImageIfNeeded() {
        let urlString = UserDefaults.standard.string(forKey: Self.nativeProfileAvatarURLKey)
        guard urlString != profileAvatarImageURL else { return }

        profileAvatarImageTask?.cancel()
        profileAvatarImageTask = nil
        profileAvatarImageURL = urlString
        profileAvatarImage = nil

        guard let urlString, let url = URL(string: urlString) else { return }

        profileAvatarImageTask = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard
                let self,
                let data,
                let image = UIImage(data: data)
            else { return }

            DispatchQueue.main.async {
                guard self.profileAvatarImageURL == urlString else { return }
                self.profileAvatarImage = image
                self.applyNativeTabBarAppearance()
            }
        }
        profileAvatarImageTask?.resume()
    }
}

private extension UIColor {
    convenience init?(hexString: String?) {
        guard var value = hexString?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
            return nil
        }
        if value.hasPrefix("#") {
            value.removeFirst()
        }
        guard value.count == 6, let rgb = UInt64(value, radix: 16) else {
            return nil
        }
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }
}

struct ComposeView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        // Register MPV player bridge before Compose initializes
        NuvioPlayerRegistration.register()
        
        let controller = MainViewControllerKt.MainViewController()
        controller.view.backgroundColor = UIColor(red: 0.008, green: 0.016, blue: 0.016, alpha: 1.0)
        return RootComposeViewController(contentController: controller)
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}

struct ContentView: View {
    var body: some View {
        ComposeView()
            .ignoresSafeArea()
    }
}
