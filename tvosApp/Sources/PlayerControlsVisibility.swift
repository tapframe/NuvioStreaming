import SwiftUI

@MainActor
final class PlayerControlsVisibility: ObservableObject {
    @Published private(set) var isVisible = true
    private var dismissTask: Task<Void, Never>?

    func registerInteraction() {
        if !isVisible { isVisible = true }
        scheduleDismissal()
    }

    func hide() {
        dismissTask?.cancel()
        dismissTask = nil
        if isVisible { isVisible = false }
    }

    func cancel() {
        dismissTask?.cancel()
        dismissTask = nil
    }

    private func scheduleDismissal() {
        dismissTask?.cancel()
        dismissTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            self?.isVisible = false
        }
    }
}
