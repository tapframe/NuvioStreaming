import SwiftUI

struct ProgressRail: View {
    let items: [ContinueWatchingCard]
    let onSelect: (ContinueWatchingCard) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 26) {
                    ForEach(items) { item in
                        ProgressButton(item: item) { onSelect(item) }
                    }
                }
                .padding(.horizontal, 48)
                .padding(.vertical, 26)
            }
        }
    }
}

private struct ProgressButton: View {
    let item: ContinueWatchingCard
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ProgressCard(item: item)
        }
        .buttonStyle(.card)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint("Opens details")
    }

    private var accessibilityLabel: String {
        var parts = [item.summary.name]
        if let season = item.season, let episode = item.episode {
            parts.append("Season \(season), episode \(episode)")
        }
        if !item.isUpcoming { parts.append("\(Int(item.progress * 100)) percent watched") }
        return parts.joined(separator: ", ")
    }
}

struct ProgressCard: View {
    let item: ContinueWatchingCard

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack(alignment: .bottomLeading) {
                RemoteArtwork(
                    urlString: item.episodeThumbnail ?? item.summary.background ?? item.summary.poster,
                    systemPlaceholder: "play.rectangle.fill"
                )
                .frame(width: 370, height: 208)
                .clipShape(RoundedRectangle(cornerRadius: 18))
                if !item.isUpcoming { progressBar }
            }
            Text(item.summary.name.tvSafe)
                .font(.headline)
                .lineLimit(1)
                .frame(width: 370, alignment: .leading)
            Text(metadata.tvSafe)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var progressBar: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(.black.opacity(0.52))
                Capsule()
                    .fill(Color.white.opacity(0.90))
                    .frame(width: proxy.size.width * item.progress)
            }
        }
        .frame(height: 7)
        .padding(12)
    }

    private var metadata: String {
        if let season = item.season, let episode = item.episode {
            let code = "S\(season) E\(episode)"
            return item.episodeTitle.map { "\(code)  \($0)" } ?? code
        }
        return item.isUpcoming ? "Upcoming" : "Continue watching"
    }
}

struct FolderButton: View {
    let folder: TVCollectionFolder
    let count: Int?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            FolderCard(folder: folder, count: count)
        }
        .buttonStyle(.card)
        .accessibilityLabel(folder.title.tvSafe)
        .accessibilityHint("Shows this collection")
    }
}

struct FolderCard: View {
    let folder: TVCollectionFolder
    let count: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            RemoteArtwork(urlString: folder.coverImageUrl, systemPlaceholder: "folder.fill")
                .frame(width: 250, height: folder.tileShape.lowercased() == "landscape" ? 150 : 250)
                .clipShape(RoundedRectangle(cornerRadius: 18))
            if !folder.hideTitle {
                Text(folder.title.tvSafe)
                    .font(.headline)
                    .lineLimit(1)
                    .frame(width: 250, alignment: .leading)
            }
            if let count {
                Text("\(count) titles").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

struct RemoteArtwork: View {
    let urlString: String?
    let systemPlaceholder: String

    var body: some View {
        AsyncImage(url: urlString.flatMap(URL.init(string:))) { phase in
            switch phase {
            case .success(let image): image.resizable().scaledToFill()
            case .empty: ZStack { NuvioTheme.panel; ProgressView() }
            default: ZStack {
                NuvioTheme.panel
                Image(systemName: systemPlaceholder)
                    .font(.system(size: 54))
                    .foregroundStyle(.secondary)
            }
            }
        }
        .clipped()
        .accessibilityHidden(true)
    }
}

struct ErrorPanel: View {
    let message: String
    let retry: () -> Void
    @FocusState private var retryFocused: Bool

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 54))
                .foregroundStyle(.orange)
            Text(message.tvSafe).font(.title3).multilineTextAlignment(.center)
            Button("Try Again", action: retry)
                .buttonStyle(.borderedProminent)
                .focused($retryFocused)
        }
        .frame(maxWidth: .infinity, minHeight: 320)
        .defaultFocus($retryFocused, true)
    }
}
