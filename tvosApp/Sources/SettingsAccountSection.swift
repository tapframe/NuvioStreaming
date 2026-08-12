import SwiftUI

struct SettingsAccountSection: View {
    @ObservedObject var auth: AuthStore
    @ObservedObject var addons: AddonStore
    @ObservedObject var profiles: TVProfileStore
    var focus: FocusState<SettingsView.Action?>.Binding
    let onSignOut: () -> Void

    var body: some View {
        NuvioPanel {
            VStack(alignment: .leading, spacing: 20) {
                Label("Account and Profile", systemImage: "person.crop.circle")
                    .font(.title2.weight(.semibold))
                accountRow
                Divider()
                profileRow
            }
        }
    }

    @ViewBuilder
    private var accountRow: some View {
        if let email = auth.signedInEmail {
            HStack(spacing: 18) {
                Label(email.tvSafe, systemImage: "checkmark.circle.fill")
                    .font(.headline)
                Spacer()
                NuvioButton(
                    title: "Sign Out",
                    symbol: "rectangle.portrait.and.arrow.right",
                    destructive: true,
                    action: onSignOut
                )
                .frame(width: 250)
                .focused(focus, equals: .logout)
            }
            if let message = addons.syncMessage {
                NuvioStatusMessage(message: message, symbol: "arrow.triangle.2.circlepath")
            }
        } else {
            HStack(spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Guest Mode").font(.headline)
                    Text("Library and addons stay on this Apple TV.")
                        .foregroundStyle(.secondary)
                }
                Spacer()
                NuvioButton(
                    title: "Sign In",
                    symbol: "person.crop.circle.badge.checkmark",
                    prominent: true,
                    action: auth.showSignIn
                )
                .frame(width: 250)
                .focused(focus, equals: .account)
            }
        }
    }

    @ViewBuilder
    private var profileRow: some View {
        if profiles.profiles.isEmpty {
            Label("Primary Profile", systemImage: "person.circle")
                .foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: 14) {
                Text("Active Profile").font(.headline)
                HStack(spacing: 16) {
                    ForEach(profiles.profiles) { profile in
                        NuvioButton(
                            title: profile.name.tvSafe,
                            symbol: profile.profileIndex == profiles.activeProfileID
                                ? "checkmark.circle.fill" : "person.circle",
                            prominent: profile.profileIndex == profiles.activeProfileID
                        ) {
                            profiles.select(profile.profileIndex)
                            Task {
                                await addons.syncFromAccount(
                                    auth: auth,
                                    profileID: profile.profileIndex
                                )
                            }
                        }
                        .focused(focus, equals: .profile(profile.profileIndex))
                    }
                }
            }
        }
    }
}
