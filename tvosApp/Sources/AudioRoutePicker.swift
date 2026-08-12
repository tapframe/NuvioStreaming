import AVKit
import SwiftUI

struct AudioRoutePicker: UIViewRepresentable {
    let onInteraction: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onInteraction: onInteraction)
    }

    func makeUIView(context: Context) -> AVRoutePickerView {
        let picker = AVRoutePickerView()
        picker.delegate = context.coordinator
        picker.prioritizesVideoDevices = false
        picker.routePickerButtonStyle = .system
        picker.activeTintColor = .white
        picker.accessibilityLabel = "Audio Output"
        picker.accessibilityHint = "Choose an AirPlay speaker or another audio output"
        return picker
    }

    func updateUIView(_ picker: AVRoutePickerView, context: Context) {
        context.coordinator.onInteraction = onInteraction
    }

    final class Coordinator: NSObject, AVRoutePickerViewDelegate {
        var onInteraction: () -> Void

        init(onInteraction: @escaping () -> Void) {
            self.onInteraction = onInteraction
        }

        func routePickerViewWillBeginPresentingRoutes(_ routePickerView: AVRoutePickerView) {
            onInteraction()
        }

        func routePickerViewDidEndPresentingRoutes(_ routePickerView: AVRoutePickerView) {
            onInteraction()
        }
    }
}
