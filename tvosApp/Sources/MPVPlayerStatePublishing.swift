import Foundation
import Libmpv

extension MPVPlayerController {
    func publishProgress() {
        guard let mpv else { return }
        var position = 0.0
        var duration = 0.0
        var paused: Int32 = 0
        var cachePaused: Int32 = 0
        var seeking: Int32 = 0
        mpv_get_property(mpv, "time-pos", MPV_FORMAT_DOUBLE, &position)
        mpv_get_property(mpv, "duration", MPV_FORMAT_DOUBLE, &duration)
        mpv_get_property(mpv, "pause", MPV_FORMAT_FLAG, &paused)
        mpv_get_property(mpv, "paused-for-cache", MPV_FORMAT_FLAG, &cachePaused)
        mpv_get_property(mpv, "seeking", MPV_FORMAT_FLAG, &seeking)
        Task { @MainActor in
            session.update(position: position, duration: duration)
            session.update(paused: paused != 0, loading: cachePaused != 0 || seeking != 0)
        }
    }

    func publishPlaybackOptions(resizeMode: PlayerResizeMode? = nil) {
        guard let mpv else { return }
        var speed = 1.0
        mpv_get_property(mpv, "speed", MPV_FORMAT_DOUBLE, &speed)
        let audio = readTracks(kind: .audio)
        let subtitles = readTracks(kind: .subtitle)
        Task { @MainActor in
            session.update(
                speed: speed,
                resizeMode: resizeMode ?? session.resizeMode,
                audioTracks: audio,
                subtitleTracks: subtitles
            )
        }
    }

    private func readTracks(kind: PlaybackTrack.Kind) -> [PlaybackTrack] {
        let count = Int(propertyInt("track-list/count"))
        return (0..<count).compactMap { index in
            guard propertyString("track-list/\(index)/type") == kind.rawValue else { return nil }
            let id = propertyInt("track-list/\(index)/id")
            guard id >= 0 else { return nil }
            return PlaybackTrack(
                id: id,
                kind: kind,
                title: propertyString("track-list/\(index)/title") ?? "",
                language: propertyString("track-list/\(index)/lang"),
                isSelected: propertyFlag("track-list/\(index)/selected")
            )
        }
    }

    private func propertyInt(_ name: String) -> Int64 {
        guard let mpv else { return -1 }
        var value: Int64 = -1
        mpv_get_property(mpv, name, MPV_FORMAT_INT64, &value)
        return value
    }

    private func propertyFlag(_ name: String) -> Bool {
        guard let mpv else { return false }
        var value: Int32 = 0
        mpv_get_property(mpv, name, MPV_FORMAT_FLAG, &value)
        return value != 0
    }

    private func propertyString(_ name: String) -> String? {
        guard let mpv, let value = mpv_get_property_string(mpv, name) else { return nil }
        defer { mpv_free(value) }
        return String(cString: value)
    }
}
