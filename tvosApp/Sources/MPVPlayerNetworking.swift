import Foundation
import Libmpv

extension MPVPlayerController {
    func applyRequestHeaders(_ requestHeaders: [String: String], responseHeaders: [String: String]) {
        guard let mpv else { return }
        mpv_set_property_string(mpv, "http-header-fields", headerFieldString(requestHeaders))
        if !responseHeaders.isEmpty {
            AppLog.playback.notice("Stream declared response header hints count=\(responseHeaders.count)")
        }
    }

    private func headerFieldString(_ headers: [String: String]) -> String {
        headers.compactMap { key, value -> String? in
            let name = key.trimmingCharacters(in: .whitespacesAndNewlines)
            let content = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty, !content.isEmpty,
                  !name.contains("\n"), !name.contains("\r"),
                  !content.contains("\n"), !content.contains("\r") else { return nil }
            return "\(name): \(content)"
        }.joined(separator: ",")
    }
}
