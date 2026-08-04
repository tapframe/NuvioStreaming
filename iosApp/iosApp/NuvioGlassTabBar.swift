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

@available(iOS 26.0, *)
struct NuvioGlassTabBar: View {
    @ObservedObject var appCoordinator: AppNavigationCoordinator
    @ObservedObject var iconStore: NativeTabIconStore
    let selection: Binding<NuvioAppTab>

    @Namespace private var glassNamespace
    @Environment(\.verticalSizeClass) private var verticalSizeClass

    private static let barGlassID = "nuvio.tabbar"

    static let portraitBottomInset: CGFloat = 12
    static let landscapeBottomInset: CGFloat = 6

    var bottomInset: CGFloat {
        verticalSizeClass == .compact ? Self.landscapeBottomInset : Self.portraitBottomInset
    }

    private var isExpanded: Bool {
        appCoordinator.isTabBarVisible
    }

    private var visibleTabs: [NuvioAppTab] {
        isExpanded ? appCoordinator.availableTabs : [appCoordinator.selectedTab]
    }

    var body: some View {
        GlassEffectContainer(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(visibleTabs, id: \.self) { tab in
                    item(for: tab)
                }
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 5)
            .glassEffect(.clear.interactive(), in: Capsule())
            .glassEffectID(Self.barGlassID, in: glassNamespace)
        }
        .frame(maxWidth: .infinity, alignment: isExpanded ? .center : .leading)
        .padding(.bottom, bottomInset)
        .ignoresSafeArea(.container, edges: .bottom)
        .animation(.smooth(duration: 0.38), value: isExpanded)
        .animation(.smooth(duration: 0.26), value: appCoordinator.selectedTab)
    }

    private func item(for tab: NuvioAppTab) -> some View {
        let selected = tab == appCoordinator.selectedTab
        return Button {
            handleTap(on: tab)
        } label: {
            VStack(spacing: 3) {
                icon(for: tab, selected: selected)

                if isExpanded {
                    Text(appCoordinator.title(for: tab))
                        .font(.system(size: 11, weight: .medium))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .foregroundStyle(
                            selected ? AnyShapeStyle(Color(uiColor: iconStore.accentColor)) : AnyShapeStyle(.secondary)
                        )
                        .legibleOverGlass(enabled: !selected)
                }
            }
            .padding(.vertical, 7)
            .padding(.horizontal, isExpanded ? 4 : 10)
            .frame(maxWidth: isExpanded ? .infinity : nil)
            .background {
                if selected && isExpanded {
                    Color.clear.glassEffect(.regular, in: Capsule())
                }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(appCoordinator.title(for: tab)))
        .accessibilityAddTraits(selected ? [.isSelected] : [])
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
                    .foregroundStyle(.secondary)
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
}

@available(iOS 26.0, *)
private extension View {
    func legibleOverGlass(enabled: Bool) -> some View {
        shadow(color: .black.opacity(enabled ? 0.35 : 0), radius: 2, x: 0, y: 0)
            .shadow(color: .black.opacity(enabled ? 0.22 : 0), radius: 5, x: 0, y: 1)
    }
}
