import SwiftUI

enum NuvioTabBarBehavior: String, CaseIterable {
    case off
    case `static`
    case autoHide = "auto_hide"
    case morphed

    static let storageKey = "NuvioNativeTabBarBehavior"
    static let fallback: NuvioTabBarBehavior = .morphed

    static func current() -> NuvioTabBarBehavior {
        guard let raw = UserDefaults.standard.string(forKey: storageKey) else { return fallback }
        return NuvioTabBarBehavior(rawValue: raw) ?? fallback
    }

    var isEnabled: Bool { self != .off }

    var usesCustomBar: Bool { self == .morphed }

    var respondsToScroll: Bool { self == .autoHide || self == .morphed }
}

private struct TabBarItemFrame: Equatable {
    let tab: NuvioAppTab
    let rect: CGRect
}

private struct TabBarItemFramePreferenceKey: PreferenceKey {
    static var defaultValue: [TabBarItemFrame] = []

    static func reduce(value: inout [TabBarItemFrame], nextValue: () -> [TabBarItemFrame]) {
        value.append(contentsOf: nextValue())
    }
}

@available(iOS 26.0, *)
struct NuvioGlassTabBar: View {
    @ObservedObject var appCoordinator: AppNavigationCoordinator
    @ObservedObject var iconStore: NativeTabIconStore
    let selection: Binding<NuvioAppTab>

    @State private var tabItemFrames: [NuvioAppTab: CGRect] = [:]
    @State private var dragSourceTab: NuvioAppTab? = nil
    @State private var dragTargetTab: NuvioAppTab? = nil
    @State private var isDragging: Bool = false
    @State private var dragTransitionToken = UUID()
    @Namespace private var glassNamespace
    @Environment(\.verticalSizeClass) private var verticalSizeClass

    @State private var selectionFeedback = UISelectionFeedbackGenerator()
    @State private var impactFeedback = UIImpactFeedbackGenerator(style: .medium)

    private static let barGlassID = "nuvio.tabbar"
    private static let pillUnionID = "nuvio.tabbar.pillUnion"

    private static let barHorizontalPadding: CGFloat = 6
    private static let barVerticalPadding: CGFloat = 5

    private static let liquidSpring: Animation = .interpolatingSpring(
        mass: 1.0, stiffness: 260, damping: 26, initialVelocity: 0
    )

    private static let bridgeHeightMultiplier: CGFloat = 1.35
    private static let bridgeCollapseDelay: TimeInterval = 0.22
    private static let bridgeOverlap: CGFloat = 18

    static let portraitBottomInset: CGFloat = 20
    static let landscapeBottomInset: CGFloat = 16

    var bottomInset: CGFloat {
        isCompactLayout ? Self.landscapeBottomInset : Self.portraitBottomInset
    }

    private var isCompactLayout: Bool {
        verticalSizeClass == .compact
    }

    private var isExpanded: Bool {
        appCoordinator.isTabBarVisible
    }

    private var visibleTabs: [NuvioAppTab] {
        isExpanded ? appCoordinator.availableTabs : [appCoordinator.selectedTab]
    }

    private var activeDragSelection: NuvioAppTab? {
        dragTargetTab
    }

    private var highlightedTab: NuvioAppTab? {
        activeDragSelection ?? appCoordinator.selectedTab
    }

    private var isBridging: Bool {
        isDragging &&
        dragSourceTab != nil &&
        dragTargetTab != nil &&
        dragSourceTab != dragTargetTab
    }

    @ViewBuilder
    private func glassPill(frame: CGRect, tinted: Bool) -> some View {
        let heightMultiplier = isBridging ? Self.bridgeHeightMultiplier : 1.0

        Capsule()
            .fill(tinted ? Color(uiColor: iconStore.accentColor).opacity(0.12) : Color.white.opacity(0.001))
            .glassEffect(.regular.interactive(), in: Capsule())
            .frame(width: frame.width, height: frame.height)
            .scaleEffect(x: 1, y: heightMultiplier, anchor: .center)
            .offset(x: frame.minX, y: frame.minY)
            .glassEffectUnion(id: Self.pillUnionID, namespace: glassNamespace)
    }

    @ViewBuilder
    private var settledPill: some View {
        if !isBridging,
           let tab = (isDragging ? dragTargetTab : nil) ?? highlightedTab,
           let frame = tabItemFrames[tab] {
            glassPill(frame: frame, tinted: true)
        }
    }

    private func translatedToOuterLayer(_ frame: CGRect) -> CGRect {
        CGRect(
            x: frame.minX + Self.barHorizontalPadding,
            y: frame.minY + Self.barVerticalPadding,
            width: frame.width,
            height: frame.height
        )
    }

    private func extendedTowards(_ frame: CGRect, other: CGRect, by amount: CGFloat) -> CGRect {
        if other.midX >= frame.midX {
            return CGRect(x: frame.minX, y: frame.minY, width: frame.width + amount, height: frame.height)
        } else {
            return CGRect(x: frame.minX - amount, y: frame.minY, width: frame.width + amount, height: frame.height)
        }
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            GlassEffectContainer(spacing: 0) {
                HStack(spacing: 0) {
                    ForEach(visibleTabs, id: \.self) { tab in
                        item(for: tab)
                    }
                }
                .coordinateSpace(name: "tabBar")
                .background(alignment: .topLeading) {
                    if isExpanded {
                        settledPill
                    }
                }
                .onPreferenceChange(TabBarItemFramePreferenceKey.self) { values in
                    let newFrames = Dictionary(values.map { ($0.tab, $0.rect) }, uniquingKeysWith: { $1 })
                    if tabItemFrames.isEmpty {
                        var transaction = Transaction()
                        transaction.disablesAnimations = true
                        withTransaction(transaction) {
                            tabItemFrames = newFrames
                        }
                    } else {
                        tabItemFrames = newFrames
                    }
                }
                .contentShape(Rectangle())
                .highPriorityGesture(dragSelectionGesture(), including: .all)
                .padding(.horizontal, Self.barHorizontalPadding)
                .padding(.vertical, Self.barVerticalPadding)
                .glassEffect(.clear.interactive(), in: Capsule())
                .glassEffectID(Self.barGlassID, in: glassNamespace)
            }

            if isExpanded, isBridging,
               let source = dragSourceTab, let target = dragTargetTab,
               let sourceFrame = tabItemFrames[source], let targetFrame = tabItemFrames[target] {
                let extendedSource = extendedTowards(sourceFrame, other: targetFrame, by: Self.bridgeOverlap)
                let extendedTarget = extendedTowards(targetFrame, other: sourceFrame, by: Self.bridgeOverlap)
                GlassEffectContainer(spacing: 0) {
                    glassPill(frame: translatedToOuterLayer(extendedSource), tinted: false)
                    glassPill(frame: translatedToOuterLayer(extendedTarget), tinted: false)
                }
                .allowsHitTesting(false)
            }
        }
        .frame(maxWidth: .infinity, alignment: isExpanded ? .center : .leading)
        .padding(.bottom, bottomInset)
        .ignoresSafeArea(.container, edges: .bottom)
        .animation(Self.liquidSpring, value: dragSourceTab)
        .animation(Self.liquidSpring, value: dragTargetTab)
        .animation(Self.liquidSpring, value: isBridging)
        .animation(Self.liquidSpring, value: tabItemFrames)
        .animation(.smooth(duration: 0.38), value: isExpanded)
        .animation(.smooth(duration: 0.26), value: appCoordinator.selectedTab)
        .onAppear {
            impactFeedback.prepare()
        }
    }

    @ViewBuilder
    private func item(for tab: NuvioAppTab) -> some View {
        let selected = tab == appCoordinator.selectedTab
        let isDragCandidate = tab == activeDragSelection
        let content = Group {
            if isCompactLayout {
                HStack(spacing: 6) {
                    icon(for: tab, selected: selected)
                    if isExpanded {
                        label(for: tab, selected: selected)
                    }
                }
            } else {
                VStack(spacing: 3) {
                    icon(for: tab, selected: selected)
                    if isExpanded {
                        label(for: tab, selected: selected)
                    }
                }
            }
        }
        .padding(.vertical, isCompactLayout ? 6 : 7)
        .padding(.horizontal, isCompactLayout ? 12 : (isExpanded ? 4 : 10))
        .frame(maxWidth: (isExpanded && !isCompactLayout) ? .infinity : nil)
        .contentShape(Capsule())
        .scaleEffect(isDragCandidate ? 1.05 : 1.0)
        .animation(Self.liquidSpring, value: isDragCandidate)
        .background(
            GeometryReader { proxy in
                Color.clear.preference(
                    key: TabBarItemFramePreferenceKey.self,
                    value: [TabBarItemFrame(tab: tab, rect: proxy.frame(in: .named("tabBar")))]
                )
            }
        )

        let button = Button {
            handleTap(on: tab)
        } label: {
            content
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(appCoordinator.title(for: tab)))
        .accessibilityAddTraits(selected ? [.isSelected] : [])

        if tab == .settings {
            button.simultaneousGesture(
                LongPressGesture(minimumDuration: 0.45)
                    .onEnded { _ in
                        guard appCoordinator.isAppReady else { return }
                        impactFeedback.impactOccurred()
                        appCoordinator.isProfileSwitcherPresented = true
                    }
            )
        } else {
            button
        }
    }

    private func label(for tab: NuvioAppTab, selected: Bool) -> some View {
        Text(appCoordinator.title(for: tab))
            .font(.system(size: 11, weight: .medium))
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .foregroundStyle(
                selected ? AnyShapeStyle(Color(uiColor: iconStore.accentColor)) : AnyShapeStyle(Color.white)
            )
            .legibleOverGlass(enabled: !selected)
    }

    private func icon(for tab: NuvioAppTab, selected: Bool) -> some View {
        let image = Image(uiImage: iconStore.image(for: tab, selected: selected))

        return Group {
            if tab == .settings {
                image
                    .renderingMode(.original)
                    .resizable()
                    .scaledToFit()
            } else if selected {
                image
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(Color(uiColor: iconStore.accentColor))
            } else {
                image
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(Color.white)
            }
        }
        .frame(width: 24, height: 24)
        .legibleOverGlass(enabled: !selected)
    }

    private func handleTap(on tab: NuvioAppTab) {
        guard isExpanded else {
            appCoordinator.requestTabBarVisible(true)
            return
        }
        selection.wrappedValue = tab
    }

    private func dragSelectionGesture() -> some Gesture {
        DragGesture(minimumDistance: 2, coordinateSpace: .named("tabBar"))
            .onChanged { value in
                guard isExpanded else { return }
                let location = value.location
                guard let matchedTab = tabItemFrames.first(where: { $0.value.contains(location) })?.key else { return }

                if !isDragging {
                    selectionFeedback.prepare()
                    isDragging = true
                    dragSourceTab = appCoordinator.selectedTab
                    dragTargetTab = matchedTab
                    if matchedTab != appCoordinator.selectedTab {
                        selectionFeedback.selectionChanged()
                        scheduleBridgeCollapse(landingOn: matchedTab)
                    }
                    return
                }

                guard matchedTab != dragTargetTab else { return }

                selectionFeedback.selectionChanged()
                selectionFeedback.prepare()
                dragSourceTab = dragTargetTab
                dragTargetTab = matchedTab
                scheduleBridgeCollapse(landingOn: matchedTab)
            }
            .onEnded { value in
                guard isExpanded else { return }
                if let tab = dragTargetTab {
                    selection.wrappedValue = tab
                }

                withAnimation(Self.liquidSpring) {
                    isDragging = false
                    dragSourceTab = nil
                    dragTargetTab = nil
                }
            }
    }

    private func scheduleBridgeCollapse(landingOn tab: NuvioAppTab) {
        let token = UUID()
        dragTransitionToken = token
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.bridgeCollapseDelay) {
            guard dragTransitionToken == token, isDragging, dragTargetTab == tab else { return }
            withAnimation(Self.liquidSpring) {
                dragSourceTab = tab
            }
        }
    }
}

@available(iOS 26.0, *)
private extension View {
    func legibleOverGlass(enabled: Bool) -> some View {
        shadow(color: .black.opacity(enabled ? 0.35 : 0), radius: 2, x: 0, y: 0)
            .shadow(color: .black.opacity(enabled ? 0.22 : 0), radius: 5, x: 0, y: 1)
    }
}
