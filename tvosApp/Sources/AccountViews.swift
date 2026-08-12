import SwiftUI

struct AccountGateView: View {
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        switch auth.status {
        case .loading:
            ZStack {
                NuvioTheme.background.ignoresSafeArea()
                VStack(spacing: 18) {
                    ProgressView().controlSize(.large)
                    Text("Restoring Your Account").font(.title3.weight(.semibold))
                }
                .accessibilityElement(children: .combine)
            }
        case .signedOut:
            SignInView()
        case .guest, .authenticated:
            AppShellView()
        }
    }
}
