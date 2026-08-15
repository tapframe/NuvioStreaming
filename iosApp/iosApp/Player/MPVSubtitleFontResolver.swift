import ComposeApp
import CoreText
import Foundation
import Libmpv
import UIKit

// MARK: - Resolver


enum MPVSubtitleFontResolver {

    /// Set to true to log a full per-font report at startup. Everything it prints
    /// goes through InAppLogBridge directly, so it does not depend on mpv's log
    /// level. Useful again if a future iOS moves fonts around.
    static var diagnosticsEnabled = false


    // MARK: Scripts

    enum Script: String, CaseIterable {
        case han, japanese, korean, thai, arabic, hebrew, devanagari

        var systemFamilies: [String] {
            switch self {
            case .han:
                return ["PingFang SC", "PingFang TC", "Hiragino Sans"]
            case .japanese:
                return ["Hiragino Sans", "Hiragino Maru Gothic ProN"]
            case .korean:
                return ["Apple SD Gothic Neo", "AppleGothic"]
            case .thai:
                return ["Thonburi", "Sukhumvit Set"]
            case .arabic:
                return ["Geeza Pro", "Al Nile", "Damascus"]
            case .hebrew:
                return ["Arial Hebrew"]
            case .devanagari:
                return ["Kohinoor Devanagari", "Devanagari Sangam MN"]
            }
        }

        var bundledFamilies: [String] { MPVSubtitleFontResolver.registeredFamilies }

        var candidateFamilies: [String] {
            self == .han
                ? bundledFamilies + systemFamilies
                : systemFamilies + bundledFamilies
        }

        var probeScalars: [UnicodeScalar] {
            switch self {
            case .han:        return ["\u{4E2D}", "\u{4EEC}", "\u{8FD9}"]
            case .japanese:   return ["\u{3042}", "\u{6F22}"]
            case .korean:     return ["\u{AC00}"]
            case .thai:       return ["\u{0E01}"]
            case .arabic:     return ["\u{0627}"]
            case .hebrew:     return ["\u{05D0}"]
            case .devanagari: return ["\u{0915}"]
            }
        }
    }

    // MARK: Bundled fonts

    private static let bundledFontsDirectory = "SubtitleFonts"

    @discardableResult
    static func registerBundledFonts() -> [String] {
        registrationLock.lock()
        defer { registrationLock.unlock() }

        if let cached = registrationLog { return cached }

        var log: [String] = []
        var families: [String] = []
        var urls: [URL] = []

        for ext in ["otf", "ttf", "ttc", "otc"] {
            urls += Bundle.main.urls(forResourcesWithExtension: ext, subdirectory: bundledFontsDirectory) ?? []
            urls += Bundle.main.urls(forResourcesWithExtension: ext, subdirectory: nil) ?? []
        }

        for url in Set(urls) {
            var error: Unmanaged<CFError>?
            guard CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) else {
                log.append("FAILED \(url.lastPathComponent): \(error?.takeRetainedValue().localizedDescription ?? "unknown")")
                continue
            }

            let discovered = (CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor])?
                .compactMap { CTFontDescriptorCopyAttribute($0, kCTFontFamilyNameAttribute) as? String } ?? []

            families += discovered
            log.append("registered \(url.lastPathComponent) families=\(Set(discovered).sorted().joined(separator: "/"))")
        }

        registeredFamilies = Set(families).sorted()
        if log.isEmpty { log.append("no bundled subtitle fonts found (system fonts only)") }

        registrationLog = log
        return log
    }

    private static let registrationLock = NSLock()
    private static var registrationLog: [String]?

    private(set) static var registeredFamilies: [String] = []

    // MARK: Resolution

    static var baselineFamily: String? { family(for: .han) }

    static func family(for script: Script) -> String? {
        cacheLock.lock()
        defer { cacheLock.unlock() }

        if let cached = cache[script] { return cached }
        let resolved = script.candidateFamilies.first { isUsable($0, for: script) }
        cache[script] = .some(resolved)
        return resolved
    }

    static func script(forLanguageTag tag: String?) -> Script? {
        guard let tag, !tag.isEmpty else { return nil }

        let normalized = tag.lowercased().replacingOccurrences(of: "_", with: "-")
        switch normalized.split(separator: "-").first.map(String.init) ?? normalized {
        case "zh", "zho", "chi", "cmn", "yue", "nan", "hak": return .han
        case "ja", "jpn", "jp":                              return .japanese
        case "ko", "kor":                                    return .korean
        case "th", "tha":                                    return .thai
        case "ar", "ara", "fa", "fas", "per", "ur", "urd", "ps", "pus", "ku": return .arabic
        case "he", "heb", "iw", "yi", "yid":                 return .hebrew
        case "hi", "hin", "mr", "mar", "ne", "nep", "sa", "san": return .devanagari
        default:                                             return nil
        }
    }

    static func script(forText text: String) -> Script? {
        var counts: [Script: Int] = [:]
        for scalar in text.unicodeScalars {
            guard let script = script(forScalar: scalar) else { continue }
            counts[script, default: 0] += 1
        }
        return counts.max { $0.value < $1.value }?.key
    }

    private static func script(forScalar scalar: UnicodeScalar) -> Script? {
        switch scalar.value {
        case 0x3040...0x30FF, 0x31F0...0x31FF:                       return .japanese
        case 0x3400...0x4DBF, 0x4E00...0x9FFF,
             0xF900...0xFAFF, 0x20000...0x2FA1F:                     return .han
        case 0x1100...0x11FF, 0x3130...0x318F, 0xAC00...0xD7AF:      return .korean
        case 0x0E00...0x0E7F:                                        return .thai
        case 0x0600...0x06FF, 0x0750...0x077F,
             0xFB50...0xFDFF, 0xFE70...0xFEFF:                       return .arabic
        case 0x0590...0x05FF:                                        return .hebrew
        case 0x0900...0x097F:                                        return .devanagari
        default:                                                     return nil
        }
    }

    // MARK: Probing

    private static let cacheLock = NSLock()
    private static var cache: [Script: String?] = [:]

    private static func isUsable(_ family: String, for script: Script) -> Bool {
        let font = CTFontCreateWithName(family as CFString, 12.0, nil)

        guard (CTFontCopyFamilyName(font) as String).caseInsensitiveCompare(family) == .orderedSame else {
            return false
        }

        guard script.probeScalars.allSatisfy({ hasGlyph(font, $0) }) else { return false }

        return isLoadableByFreeType(font)
    }

    private static func isLoadableByFreeType(_ font: CTFont) -> Bool {
        let descriptor = CTFontCopyFontDescriptor(font)
        guard let url = CTFontDescriptorCopyAttribute(descriptor, kCTFontURLAttribute) as? URL,
              FileManager.default.isReadableFile(atPath: url.path) else {
            return false
        }
        return !url.path.hasPrefix("/System/Library/PrivateFrameworks/")
    }

    private static func hasGlyph(_ font: CTFont, _ scalar: UnicodeScalar) -> Bool {
        var utf16 = Array(String(scalar).utf16)
        var glyphs = [CGGlyph](repeating: 0, count: utf16.count)
        guard CTFontGetGlyphsForCharacters(font, &utf16, &glyphs, utf16.count) else { return false }
        return glyphs.allSatisfy { $0 != 0 }
    }

    // MARK: Diagnostics

    static func diagnosticsReport() -> [String] {
        var lines = ["bundled families: \(registeredFamilies.isEmpty ? "(none)" : registeredFamilies.joined(separator: ", "))"]

        for script in Script.allCases {
            for family in script.candidateFamilies {
                let font = CTFontCreateWithName(family as CFString, 12.0, nil)
                let resolved = CTFontCopyFamilyName(font) as String
                let nameOK = resolved.caseInsensitiveCompare(family) == .orderedSame
                let glyphs = script.probeScalars
                    .map { String(format: "U+%04X=%@", $0.value, hasGlyph(font, $0) ? "y" : "n") }
                    .joined(separator: ",")
                let url = CTFontDescriptorCopyAttribute(CTFontCopyFontDescriptor(font), kCTFontURLAttribute) as? URL

                lines.append(
                    "\(script.rawValue)/\(family): \(isUsable(family, for: script) ? "USABLE" : "rejected") "
                    + "name=\(nameOK ? "ok" : "SUBSTITUTED(\(resolved))") "
                    + "glyphs=[\(glyphs)] url=\(url?.path ?? "NIL")"
                )
            }
        }
        return lines
    }
}

// MARK: - Player wiring

final class MPVSubtitleFontController {

    private weak var player: MPVPlayerViewController?

    private var appliedFamily: String?
    private var scriptFromLanguage: MPVSubtitleFontResolver.Script?
    private var scriptFromText: MPVSubtitleFontResolver.Script?

    init(player: MPVPlayerViewController) {
        self.player = player
    }

    func applySetupOptions(_ setOption: (String, String) -> Void) {
        for line in MPVSubtitleFontResolver.registerBundledFonts() {
            InAppLogBridge.shared.info(tag: "MPV/SubFont", message: line)
        }

        if MPVSubtitleFontResolver.diagnosticsEnabled {
            for line in MPVSubtitleFontResolver.diagnosticsReport() {
                InAppLogBridge.shared.info(tag: "MPV/SubFont", message: line)
            }
        }

        guard let family = MPVSubtitleFontResolver.baselineFamily else {
            InAppLogBridge.shared.warn(
                tag: "MPV/SubFont",
                message: "No CJK-capable font available; non-Latin subtitles may render as boxes"
            )
            return
        }

        setOption("sub-font", family)
        appliedFamily = family
        InAppLogBridge.shared.info(tag: "MPV/SubFont", message: "baseline font: \(family)")
    }

    func reapplyFont() {
        guard let family = appliedFamily else { return }
        player?.setStringProperty("sub-font", family)
    }

    func handlePropertyChange(_ eventPtr: UnsafeMutablePointer<mpv_event>) {
        guard let data = eventPtr.pointee.data else { return }
        let property = UnsafePointer<mpv_event_property>(OpaquePointer(data)).pointee
        guard let namePtr = property.name else { return }

        let name = String(cString: namePtr)
        guard name == "sub-text" || name == "current-tracks/sub/lang" else { return }

        var value: String?
        if property.format == MPV_FORMAT_STRING, let valueData = property.data {
            value = valueData.assumingMemoryBound(to: UnsafePointer<CChar>?.self).pointee
                .map { String(cString: $0) }
        }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if name == "sub-text" {
                self.handleText(value)
            } else {
                self.handleLanguage(value)
            }
        }
    }

    private func handleLanguage(_ tag: String?) {
        let script = MPVSubtitleFontResolver.script(forLanguageTag: tag)
        guard script != scriptFromLanguage else { return }

        scriptFromLanguage = script
        scriptFromText = nil  // a new track invalidates the old track's text
        applyResolvedFont()
    }

    private func handleText(_ text: String?) {
        guard let text, !text.isEmpty else { return }

        guard let script = MPVSubtitleFontResolver.script(forText: text),
              script != scriptFromText else { return }

        scriptFromText = script
        applyResolvedFont()
    }

    private func applyResolvedFont() {
        let script = scriptFromText ?? scriptFromLanguage
        let family = script.flatMap { MPVSubtitleFontResolver.family(for: $0) }
            ?? MPVSubtitleFontResolver.baselineFamily

        guard let family, family != appliedFamily else { return }

        appliedFamily = family
        player?.setStringProperty("sub-font", family)
        InAppLogBridge.shared.info(
            tag: "MPV/SubFont",
            message: "font -> \(family) (script=\(script?.rawValue ?? "default"))"
        )
    }
}
