package com.nuvio.app.features.player.desktop

import java.io.File
import java.nio.file.Files
import java.util.concurrent.atomic.AtomicBoolean

internal fun interface NativePlayerEventSink {
    fun onPlayerEvent(type: String, value: Double)
}

internal object NativePlayerBridge {
    private val preloadStarted = AtomicBoolean(false)

    init {
        loadNativeLibrary()
    }

    external fun create(
        hostViewPtr: Long,
        sourceUrl: String,
        headerLines: Array<String>,
        playWhenReady: Boolean,
        initialPositionMs: Long,
        controlsPageUrl: String,
        eventSink: NativePlayerEventSink,
    ): Long

    external fun dispose(handle: Long)
    external fun updateControls(handle: Long, controlsJson: String)
    external fun setPaused(handle: Long, paused: Boolean)
    external fun seekTo(handle: Long, positionMs: Long)
    external fun seekBy(handle: Long, offsetMs: Long)
    external fun setSpeed(handle: Long, speed: Float)
    external fun setResizeMode(handle: Long, mode: Int)
    external fun durationMs(handle: Long): Long
    external fun positionMs(handle: Long): Long
    external fun bufferedPositionMs(handle: Long): Long
    external fun isLoading(handle: Long): Boolean
    external fun isEnded(handle: Long): Boolean
    external fun isPaused(handle: Long): Boolean
    external fun speed(handle: Long): Float
    external fun audioTracksJson(handle: Long): String
    external fun subtitleTracksJson(handle: Long): String
    external fun selectAudioTrack(handle: Long, trackId: Int)
    external fun selectSubtitleTrack(handle: Long, trackId: Int)
    external fun addSubtitleUrl(handle: Long, url: String)
    external fun clearExternalSubtitles(handle: Long)
    external fun clearExternalSubtitlesAndSelect(handle: Long, trackId: Int)
    external fun applyWindowChrome(
        windowHwnd: Long,
        darkMode: Boolean,
        captionColorRgb: Int,
        borderColorRgb: Int,
        textColorRgb: Int,
    )

    external fun setSubtitleDelayMs(handle: Long, delayMs: Int)
    external fun applySubtitleStyle(
        handle: Long,
        textColor: String,
        backgroundColor: String,
        outlineColor: String,
        outlineSize: Float,
        bold: Boolean,
        fontSize: Float,
        subPos: Int,
    )
    external fun warmupWebView2(controlsPageUrl: String): Boolean
    external fun shutdownWebView2Warmup()

    val controlsPageUrl: String by lazy { controlsPageAssets.url }
    private val controlsPageAssets: ControlsPageAssets by lazy { exportControlsPageAssets() }

    fun preloadAsync() {
        if (!preloadStarted.compareAndSet(false, true)) return
        Thread {
            val controlsPage = runCatching { controlsPageAssets }
                .getOrNull()
                ?: return@Thread
            if (DesktopHostOs.current == DesktopHostOs.WINDOWS) {
                runCatching { warmupWebView2(controlsPage.url) }
            }
        }.apply {
            name = "nuvio-native-player-preload"
            isDaemon = true
            start()
        }
        if (DesktopHostOs.current == DesktopHostOs.WINDOWS) {
            Runtime.getRuntime().addShutdownHook(
                Thread {
                    runCatching { shutdownWebView2Warmup() }
                }.apply {
                    name = "nuvio-webview2-warmup-shutdown"
                }
            )
        }
    }

    private fun loadNativeLibrary() {
        val platform = DesktopHostOs.current
        require(platform == DesktopHostOs.MACOS || platform == DesktopHostOs.WINDOWS) {
            "Native desktop playback is not implemented for $platform yet."
        }

        val libraryName = nativeLibraryName(platform)
        val platformDir = nativeDirectoryName(platform)
        findLocalBuildLibrary(platformDir, libraryName)?.let { localLibrary ->
            copyLocalRuntimeResources(platformDir, localLibrary.parentFile)
            System.load(localLibrary.absolutePath)
            return
        }

        val resource = "/native/$platformDir/$libraryName"
        val input = NativePlayerBridge::class.java.getResourceAsStream(resource)
            ?: error("Missing bundled native player bridge: $resource")
        val dir = File(System.getProperty("java.io.tmpdir"), "native-player-bridge").apply { mkdirs() }
        val suffix = libraryName.substringAfter("player_bridge", ".dylib")
        val file = Files.createTempFile(dir.toPath(), "player-bridge-", suffix).toFile()
        file.deleteOnExit()
        extractBundledRuntimeResources(platformDir, dir)
        input.use { source ->
            file.outputStream().use { target -> source.copyTo(target) }
        }
        System.load(file.absolutePath)
    }

    private fun extractBundledRuntimeResources(platformDir: String, dir: File) {
        val runtimeNames = bundledRuntimeResourceNames(platformDir)
        runtimeNames.forEach { name ->
            val resource = "/native/$platformDir/$name"
            val input = NativePlayerBridge::class.java.getResourceAsStream(resource) ?: return@forEach
            val target = dir.resolve(name)
            input.use { source ->
                target.outputStream().use { output -> source.copyTo(output) }
            }
            target.deleteOnExit()
        }
    }

    private fun bundledRuntimeResourceNames(platformDir: String): List<String> {
        val indexResource = "/native/$platformDir/runtime-files.txt"
        val indexed = NativePlayerBridge::class.java.getResourceAsStream(indexResource)
            ?.bufferedReader()
            ?.useLines { lines ->
                lines.map(String::trim)
                    .filter { it.isNotEmpty() && !it.startsWith("#") }
                    .toList()
            }
            .orEmpty()
        if (indexed.isNotEmpty()) return indexed

        return when (platformDir) {
            "windows" -> listOf("libmpv-2.dll")
            else -> emptyList()
        }
    }

    private fun findLocalBuildLibrary(platformDir: String, libraryName: String): File? {
        val candidates = listOf(
            File("composeApp/build/native/$platformDir/$libraryName"),
            File("build/native/$platformDir/$libraryName"),
        )
        return candidates.firstOrNull { it.exists() }
    }

    private fun copyLocalRuntimeResources(platformDir: String, targetDir: File) {
        val runtimeDirs = listOf(
            File("composeApp/build/native/$platformDir-runtime"),
            File("build/native/$platformDir-runtime"),
        )
        runtimeDirs.firstOrNull(File::isDirectory)
            ?.listFiles { file -> file.isFile }
            ?.forEach { runtimeFile ->
                val target = targetDir.resolve(runtimeFile.name)
                if (runtimeFile.absolutePath != target.absolutePath) {
                    runCatching { runtimeFile.copyTo(target, overwrite = true) }
                }
            }
    }

    private fun nativeDirectoryName(platform: DesktopHostOs): String =
        when (platform) {
            DesktopHostOs.MACOS -> "macos"
            DesktopHostOs.WINDOWS -> "windows"
            DesktopHostOs.LINUX -> "linux"
            DesktopHostOs.UNKNOWN -> "unknown"
        }

    private fun nativeLibraryName(platform: DesktopHostOs): String =
        when (platform) {
            DesktopHostOs.MACOS -> "libplayer_bridge.dylib"
            DesktopHostOs.WINDOWS -> "player_bridge.dll"
            DesktopHostOs.LINUX -> "libplayer_bridge.so"
            DesktopHostOs.UNKNOWN -> "player_bridge"
        }

    private fun exportControlsPageAssets(): ControlsPageAssets {
        val root = File(System.getProperty("java.io.tmpdir"), "nuvio-player-ui").apply { mkdirs() }
        val fontsDir = root.resolve("fonts").apply { mkdirs() }
        val htmlFile = root.resolve("controls.html")
        writeTextIfChanged(
            target = htmlFile,
            text = readTextResource("/player-ui/controls.html"),
        )
        writeTextIfChanged(
            target = root.resolve("controls.css"),
            text = readTextResource("/player-ui/controls.css")
                .replace("/* __NUVIO_PLAYER_FONT_FACES__ */", nativePlayerFontFaces()),
        )
        copyResourceIfChanged(
            resource = "/player-ui/controls.js",
            target = root.resolve("controls.js"),
        )
        copyResourceIfChanged(
            resource = "/composeResources/nuvio.composeapp.generated.resources/font/jetbrains_sans_regular.ttf",
            target = fontsDir.resolve("jetbrains_sans_regular.ttf"),
        )
        copyResourceIfChanged(
            resource = "/composeResources/nuvio.composeapp.generated.resources/font/jetbrains_sans_semibold.ttf",
            target = fontsDir.resolve("jetbrains_sans_semibold.ttf"),
        )
        copyResourceIfChanged(
            resource = "/composeResources/nuvio.composeapp.generated.resources/font/jetbrains_sans_bold.ttf",
            target = fontsDir.resolve("jetbrains_sans_bold.ttf"),
        )
        return ControlsPageAssets(
            url = htmlFile.toURI().toASCIIString(),
        )
    }

    private fun nativePlayerFontFaces(): String =
        """
            @font-face {
              font-family: "Nuvio JetBrains Sans";
              src: url("fonts/jetbrains_sans_regular.ttf") format("truetype");
              font-weight: 400;
              font-style: normal;
              font-display: block;
            }
            @font-face {
              font-family: "Nuvio JetBrains Sans";
              src: url("fonts/jetbrains_sans_semibold.ttf") format("truetype");
              font-weight: 600;
              font-style: normal;
              font-display: block;
            }
            @font-face {
              font-family: "Nuvio JetBrains Sans";
              src: url("fonts/jetbrains_sans_bold.ttf") format("truetype");
              font-weight: 700 900;
              font-style: normal;
              font-display: block;
            }
        """.trimIndent()

    private fun readTextResource(resource: String): String =
        NativePlayerBridge::class.java.getResourceAsStream(resource)
            ?.bufferedReader(Charsets.UTF_8)
            ?.use { it.readText() }
            ?: error("Missing native player controls resource: $resource")

    private fun writeTextIfChanged(target: File, text: String) {
        val bytes = text.toByteArray(Charsets.UTF_8)
        if (target.exists() && target.readBytes().contentEquals(bytes)) return
        target.writeBytes(bytes)
    }

    private fun copyResourceIfChanged(resource: String, target: File) {
        val bytes = NativePlayerBridge::class.java.getResourceAsStream(resource)
            ?.use { it.readBytes() }
            ?: error("Missing native player controls resource: $resource")
        if (target.exists() && target.readBytes().contentEquals(bytes)) return
        Files.createDirectories(target.parentFile.toPath())
        target.writeBytes(bytes)
    }

    private data class ControlsPageAssets(
        val url: String,
    )
}

internal fun preloadNativePlayerBridgeAsync() {
    if (DesktopHostOs.current == DesktopHostOs.MACOS || DesktopHostOs.current == DesktopHostOs.WINDOWS) {
        NativePlayerBridge.preloadAsync()
    }
}
