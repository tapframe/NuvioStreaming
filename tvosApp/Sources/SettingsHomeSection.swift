import SwiftUI

struct SettingsHomeSection: View {
    @ObservedObject var auth: AuthStore
    @ObservedObject var profiles: TVProfileStore
    @ObservedObject var preferences: HomePreferencesStore
    var focus: FocusState<SettingsView.Action?>.Binding

    var body: some View {
        NuvioPanel {
            VStack(alignment: .leading, spacing: 20) {
                Label("Home", systemImage: "house")
                    .font(.title2.weight(.semibold))
                Toggle("Show featured hero", isOn: binding(
                    get: { preferences.value.heroEnabled },
                    set: preferences.setHeroEnabled
                ))
                .focused(focus, equals: .hero)
                Toggle("Show catalog media type", isOn: binding(
                    get: { preferences.value.showCatalogType },
                    set: preferences.setShowCatalogType
                ))
                .focused(focus, equals: .catalogType)
                Toggle("Hide unreleased content", isOn: binding(
                    get: { preferences.value.hideUnreleasedContent },
                    set: preferences.setHideUnreleasedContent
                ))
                .focused(focus, equals: .unreleased)
                Divider()
                Text("Sections").font(.headline)
                ForEach(orderedItems, id: \.key) { item in
                    sectionRow(item)
                }
            }
        }
    }

    private var orderedItems: [HomeCatalogPreference] {
        preferences.value.items.sorted { $0.order < $1.order }
    }

    private func sectionRow(_ item: HomeCatalogPreference) -> some View {
        HStack(spacing: 14) {
            Toggle(item.customTitle.trimmedNonEmpty ?? itemName(item.key), isOn: binding(
                get: { preferences.value.preference(for: item.key)?.enabled ?? true },
                set: { preferences.setEnabled(key: item.key, enabled: $0) }
            ))
            Spacer()
            NuvioButton(title: "Move Up", symbol: "arrow.up") {
                move(item.key, direction: -1)
            }
            .frame(width: 180)
            .focused(focus, equals: .homeItem(item.key, -1))
            .disabled(item.key == orderedItems.first?.key)
            NuvioButton(title: "Move Down", symbol: "arrow.down") {
                move(item.key, direction: 1)
            }
            .frame(width: 205)
            .focused(focus, equals: .homeItem(item.key, 1))
            .disabled(item.key == orderedItems.last?.key)
        }
    }

    private func binding(get: @escaping () -> Bool, set: @escaping (Bool) -> Void) -> Binding<Bool> {
        Binding(get: get) { value in
            set(value)
            push()
        }
    }

    private func move(_ key: String, direction: Int) {
        preferences.move(key: key, direction: direction)
        push()
    }

    private func push() {
        preferences.schedulePush(auth: auth, profileID: profiles.activeProfileID)
    }

    private func itemName(_ key: String) -> String {
        key.hasPrefix("collection_")
            ? "Collection"
            : key.split(separator: ":").last.map(String.init) ?? "Catalog"
    }
}
