import SwiftUI

struct AddonsView: View {
    @EnvironmentObject private var store: AddonStore
    @State private var manifestURL = ""
    @State private var statusMessage: String?
    @State private var statusIsSuccess = false
    @State private var isAdding = false
    @State private var addonPendingRemoval: AddonEndpoint?
    @FocusState private var focus: AddonFocus?

    private enum AddonFocus: Hashable { case field, add, remove(String) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 30) {
                NuvioPageHeader(
                    title: "Addons",
                    subtitle: "Manage the services that provide catalogs, metadata, and streams"
                )
                addForm
                enabledAddons
            }
            .padding(48)
        }
        .defaultFocus($focus, store.addons.isEmpty ? .field : nil)
        .confirmationDialog(
            "Remove \(addonPendingRemoval?.name.tvSafe ?? "addon")?",
            isPresented: Binding(
                get: { addonPendingRemoval != nil },
                set: { if !$0 { addonPendingRemoval = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Remove", role: .destructive) {
                guard let addon = addonPendingRemoval else { return }
                addonPendingRemoval = nil
                Task { await store.remove(addon) }
            }
            Button("Cancel", role: .cancel) { addonPendingRemoval = nil }
        } message: {
            Text("Its catalogs and streams will stop appearing on this Apple TV.")
        }
    }

    private var addForm: some View {
        NuvioPanel {
            VStack(alignment: .leading, spacing: 16) {
                Label("Add from Manifest URL", systemImage: "link.badge.plus")
                    .font(.title2.weight(.semibold))
                Text("Paste a Stremio manifest link. Use an iPhone keyboard or Siri Remote dictation for faster entry.")
                    .foregroundStyle(.secondary)
                HStack(spacing: 18) {
                    TextField("https://example.com/manifest.json", text: $manifestURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focus, equals: .field)
                        .onSubmit(add)
                    Button(action: add) {
                        if isAdding { ProgressView() } else { Label("Add Addon", systemImage: "plus") }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isAdding || manifestURL.trimmedNonEmpty == nil)
                    .focused($focus, equals: .add)
                }
                if let statusMessage {
                    NuvioStatusMessage(
                        message: statusMessage,
                        symbol: statusIsSuccess ? "checkmark.circle.fill" : "exclamationmark.triangle.fill",
                        tint: statusIsSuccess ? .secondary : .orange
                    )
                }
            }
        }
    }

    @ViewBuilder
    private var enabledAddons: some View {
        if store.addons.isEmpty {
            NuvioUnavailableView(
                title: "No Addons Enabled",
                symbol: "puzzlepiece.extension",
                message: "Add a manifest link to bring catalogs and streams to Nuvio."
            )
        } else {
            VStack(alignment: .leading, spacing: 16) {
                Text("Enabled Addons").font(.title2.weight(.semibold))
                ForEach(store.addons) { addon in addonRow(addon) }
                if let syncMessage = store.syncMessage {
                    NuvioStatusMessage(message: syncMessage, symbol: "arrow.triangle.2.circlepath")
                }
            }
        }
    }

    private func addonRow(_ addon: AddonEndpoint) -> some View {
        NuvioPanel {
            HStack(spacing: 20) {
                Image(systemName: addon.providesStreams ? "play.rectangle.fill" : "rectangle.stack")
                    .font(.title)
                    .frame(width: 48)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 6) {
                    Text(addon.name.tvSafe).font(.title3.weight(.semibold))
                    Text(addon.detail?.tvSafe ?? addon.baseURL.tvSafe)
                        .font(.callout).foregroundStyle(.secondary).lineLimit(2)
                    Label(
                        addon.providesStreams ? "Provides streams" : "Catalog and metadata only",
                        systemImage: addon.providesStreams ? "play.circle.fill" : "info.circle"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                }
                Spacer()
                Button(role: .destructive) { addonPendingRemoval = addon } label: {
                    Label("Remove", systemImage: "trash")
                }
                .buttonStyle(.bordered)
                .focused($focus, equals: .remove(addon.id))
            }
        }
    }

    private func add() {
        guard manifestURL.trimmedNonEmpty != nil else {
            statusMessage = "Enter a manifest URL first."
            statusIsSuccess = false
            focus = .field
            return
        }
        Task { await addManifest() }
    }

    @MainActor
    private func addManifest() async {
        isAdding = true
        statusMessage = nil
        do {
            try await store.add(manifestURL: manifestURL)
            statusMessage = "Addon added successfully."
            statusIsSuccess = true
            manifestURL = ""
        } catch {
            statusMessage = error.userMessage
            statusIsSuccess = false
        }
        isAdding = false
    }
}
