import SwiftUI

struct PlaybackTimelineScrubber: View {
    let position: Double
    let duration: Double
    let isFocused: Bool
    let onSeek: (Double) -> Void

    @State private var scrubPosition = 0.0
    @State private var isScrubbing = false

    private let stepSeconds = 10.0

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(.white.opacity(0.3))
                    .frame(height: trackHeight)
                Capsule()
                    .fill(.white)
                    .frame(width: width * progress, height: trackHeight)
                if isFocused {
                    Circle()
                        .fill(.white)
                        .frame(width: thumbSize, height: thumbSize)
                        .offset(x: max(0, width * progress - thumbSize / 2))
                }
            }
            .frame(maxHeight: .infinity)
        }
        .frame(height: isFocused ? 28 : 14)
        .focusable(false)
        .onAppear { scrubPosition = position }
        .onChange(of: position) { _, position in
            if !isScrubbing { scrubPosition = position }
        }
        .onMoveCommand { direction in
            guard isFocused else { return }
            switch direction {
            case .left: scrub(by: -stepSeconds)
            case .right: scrub(by: stepSeconds)
            default: break
            }
        }
        .animation(.easeOut(duration: 0.18), value: isFocused)
    }

    private var trackHeight: Double { isFocused ? 10 : 7 }
    private var thumbSize: Double { 24 }

    private var progress: Double {
        guard duration > 0 else { return 0 }
        return min(max(scrubPosition / duration, 0), 1)
    }

    private func scrub(by seconds: Double) {
        isScrubbing = true
        scrubPosition = min(max(scrubPosition + seconds, 0), max(duration, 0))
        onSeek(scrubPosition)
        isScrubbing = false
    }
}
