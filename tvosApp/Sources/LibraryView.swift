import SwiftUI

struct LibraryView: View {
    let onSelect: (MetaSummary) -> Void

    @EnvironmentObject private var library: LibraryStore
    @FocusState private var focusedID: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 30) {
                NuvioPageHeader(
                    title: "Library",
                    subtitle: "Titles saved to your active profile"
                )

                if library.items.isEmpty {
                NuvioUnavailableView(
                    title: "Your Library Is Empty",
                    symbol: "heart",
                    message: "Open any title and add it to your library."
                )
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 34)], spacing: 42) {
                        ForEach(library.items) { item in
                            Button {
                                onSelect(item)
                            } label: {
                                PosterCard(item: item)
                            }
                            .buttonStyle(.card)
                            .focused($focusedID, equals: item.id)
                        }
                    }
                    .padding(.vertical, 18)
                }
            }
            .padding(48)
        }
        .defaultFocus($focusedID, library.items.first?.id)
    }
}
