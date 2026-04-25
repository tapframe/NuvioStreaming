package com.nuvio.app.features.player

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.net.Uri
import android.util.Log
import android.util.TypedValue
import android.graphics.Typeface
import android.os.Build
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import kotlinx.coroutines.runBlocking
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.extractor.DefaultExtractorsFactory
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory
import androidx.media3.extractor.ts.TsExtractor
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import androidx.media3.ui.SubtitleView
import androidx.media3.ui.CaptionStyleCompat
import com.nuvio.app.R
import io.github.peerless2012.ass.media.widget.AssSubtitleView
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

private const val TAG = "NuvioPlayer"

@androidx.annotation.OptIn(UnstableApi::class)
@Composable
actual fun PlatformPlayerSurface(
    sourceUrl: String,
    sourceAudioUrl: String?,
    sourceHeaders: Map<String, String>,
    sourceResponseHeaders: Map<String, String>,
    useYoutubeChunkedPlayback: Boolean,
    modifier: Modifier,
    playWhenReady: Boolean,
    resizeMode: PlayerResizeMode,
    useNativeController: Boolean,
    onControllerReady: (PlayerEngineController) -> Unit,
    onSnapshot: (PlayerPlaybackSnapshot) -> Unit,
    onError: (String?) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val latestOnSnapshot = rememberUpdatedState(onSnapshot)
    val latestOnError = rememberUpdatedState(onError)
    val coroutineScope = rememberCoroutineScope()

    val playerSettings = remember {
        PlayerSettingsRepository.ensureLoaded()
        PlayerSettingsRepository.uiState.value
    }

    val sanitizedSourceHeaders = remember(sourceHeaders) {
        sanitizePlaybackHeaders(sourceHeaders)
    }
    val sanitizedSourceResponseHeaders = remember(sourceResponseHeaders) {
        sanitizePlaybackResponseHeaders(sourceResponseHeaders)
    }
    val useLibass = playerSettings.useLibass
    val libassRenderType = runCatching {
        LibassRenderType.valueOf(playerSettings.libassRenderType)
    }.getOrDefault(LibassRenderType.CUES)

    val exoPlayer = remember(sourceUrl, sourceAudioUrl, sanitizedSourceHeaders, sanitizedSourceResponseHeaders) {
        val renderersFactory = DefaultRenderersFactory(context)
            .setExtensionRendererMode(playerSettings.decoderPriority)
            .setMapDV7ToHevc(playerSettings.mapDV7ToHevc)

        val trackSelector = DefaultTrackSelector(context).apply {
            setParameters(
                buildUponParameters()
                    .setAllowInvalidateSelectionsOnRendererCapabilitiesChange(true)
            )
            if (playerSettings.tunnelingEnabled) {
                setParameters(buildUponParameters().setTunnelingEnabled(true))
            }
        }

        val loadControl = DefaultLoadControl.Builder()
            .setTargetBufferBytes(100 * 1024 * 1024)
            .setBufferDurationsMs(
                DefaultLoadControl.DEFAULT_MIN_BUFFER_MS,
                70_000,
                DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_MS,
                5_000
            )
            .build()

        val extractorsFactory = DefaultExtractorsFactory()
            .setTsExtractorFlags(DefaultTsPayloadReaderFactory.FLAG_ENABLE_HDMV_DTS_AUDIO_STREAMS)
            .setTsExtractorTimestampSearchBytes(1500 * TsExtractor.TS_PACKET_SIZE)

        val dataSourceFactory = PlatformPlaybackDataSourceFactory.create(
            context = context,
                defaultRequestHeaders = sanitizedSourceHeaders,
                defaultResponseHeaders = sanitizedSourceResponseHeaders,
                useYoutubeChunkedPlayback = useYoutubeChunkedPlayback,
            )

        val player = if (useLibass) {
            ExoPlayer.Builder(context)
                .setTrackSelector(trackSelector)
                .setLoadControl(loadControl)
                .buildWithAssSupportCompat(
                    context = context,
                    renderType = libassRenderType.toAssRenderType(),
                    dataSourceFactory = dataSourceFactory,
                    extractorsFactory = extractorsFactory,
                    renderersFactory = renderersFactory
                )
        } else {
            val mediaSourceFactory = DefaultMediaSourceFactory(
                dataSourceFactory,
                extractorsFactory,
            )

            ExoPlayer.Builder(context)
                .setRenderersFactory(renderersFactory)
                .setTrackSelector(trackSelector)
                .setLoadControl(loadControl)
                .setMediaSourceFactory(mediaSourceFactory)
                .build()
        }

        player.apply {
                if (!sourceAudioUrl.isNullOrBlank()) {
                    val msf = DefaultMediaSourceFactory(dataSourceFactory, extractorsFactory)
                    val videoSource = msf.createMediaSource(MediaItem.fromUri(sourceUrl))
                    val audioSource = msf.createMediaSource(MediaItem.fromUri(sourceAudioUrl))
                    setMediaSource(MergingMediaSource(videoSource, audioSource))
                } else {
                    setMediaItem(MediaItem.fromUri(sourceUrl))
                }
                prepare()
                this.playWhenReady = playWhenReady
            }
    }

    val pendingSubtitleTrackIndex = remember { mutableListOf<Int>() }
    var playerViewRef by remember { mutableStateOf<PlayerView?>(null) }
    var currentSubtitleStyle by remember { mutableStateOf(SubtitleStyleState.DEFAULT) }
    var subtitleSelectionJob by remember { mutableStateOf<Job?>(null) }

    DisposableEffect(exoPlayer) {
        PlayerPictureInPictureManager.registerPausePlaybackCallback {
            exoPlayer.pause()
        }

        val listener = object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                latestOnError.value(error.localizedMessage ?: runBlocking { getString(Res.string.player_unable_to_play_stream) })
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                val stateName = when (playbackState) {
                    Player.STATE_IDLE -> "IDLE"
                    Player.STATE_BUFFERING -> "BUFFERING"
                    Player.STATE_READY -> "READY"
                    Player.STATE_ENDED -> "ENDED"
                    else -> "UNKNOWN($playbackState)"
                }
                Log.d(TAG, "onPlaybackStateChanged: $stateName")
                if (playbackState == Player.STATE_READY) {
                    latestOnError.value(null)
                    exoPlayer.logCurrentTracks("STATE_READY")
                }
                latestOnSnapshot.value(exoPlayer.snapshot())
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                latestOnSnapshot.value(exoPlayer.snapshot())
            }

            override fun onPlaybackParametersChanged(playbackParameters: androidx.media3.common.PlaybackParameters) {
                latestOnSnapshot.value(exoPlayer.snapshot())
            }

            override fun onTracksChanged(tracks: androidx.media3.common.Tracks) {
                Log.d(TAG, "onTracksChanged: ${tracks.groups.size} groups total")
                exoPlayer.logCurrentTracks("onTracksChanged")
                if (pendingSubtitleTrackIndex.isNotEmpty() && tracks.groups.isNotEmpty()) {
                    val idx = pendingSubtitleTrackIndex.removeAt(0)
                    Log.d(TAG, "onTracksChanged: applying pending subtitle selection index=$idx")
                    exoPlayer.trackSelectionParameters = exoPlayer.trackSelectionParameters
                        .buildUpon()
                        .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, idx < 0)
                        .build()
                    if (idx >= 0) {
                        exoPlayer.selectTrackByIndex(C.TRACK_TYPE_TEXT, idx)
                    }
                }
                latestOnSnapshot.value(exoPlayer.snapshot())
            }

        }
        exoPlayer.addListener(listener)
        onDispose {
            PlayerPictureInPictureManager.registerPausePlaybackCallback(null)
            exoPlayer.removeListener(listener)
            subtitleSelectionJob?.cancel()
        }
    }

    DisposableEffect(exoPlayer, lifecycleOwner) {
        val activity = context.findActivity()
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> exoPlayer.playWhenReady = playWhenReady
                Lifecycle.Event.ON_STOP -> {
                    val isInPictureInPicture =
                        Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && activity?.isInPictureInPictureMode == true
                    val isFinishing = activity?.isFinishing == true
                    if (!isInPictureInPicture || isFinishing) {
                        exoPlayer.pause()
                    }
                }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            exoPlayer.release()
        }
    }

    LaunchedEffect(exoPlayer, playWhenReady) {
        exoPlayer.playWhenReady = playWhenReady
        latestOnSnapshot.value(exoPlayer.snapshot())
    }

    LaunchedEffect(exoPlayer) {
        onControllerReady(
            object : PlayerEngineController {
                override fun play() {
                    exoPlayer.playWhenReady = true
                    exoPlayer.play()
                }

                override fun pause() {
                    exoPlayer.pause()
                }

                override fun seekTo(positionMs: Long) {
                    exoPlayer.seekTo(positionMs.coerceAtLeast(0L))
                }

                override fun seekBy(offsetMs: Long) {
                    exoPlayer.seekTo((exoPlayer.currentPosition + offsetMs).coerceAtLeast(0L))
                }

                override fun retry() {
                    exoPlayer.prepare()
                    exoPlayer.playWhenReady = true
                }

                override fun setPlaybackSpeed(speed: Float) {
                    exoPlayer.setPlaybackSpeed(speed)
                }

                override fun getAudioTracks(): List<AudioTrack> =
                    exoPlayer.extractAudioTracks()

                override fun getSubtitleTracks(): List<SubtitleTrack> {
                    val tracks = exoPlayer.extractSubtitleTracks()
                    Log.d(TAG, "getSubtitleTracks: found ${tracks.size} tracks")
                    tracks.forEach { t ->
                        Log.d(TAG, "  track idx=${t.index} id=${t.id} label='${t.label}' lang=${t.language} selected=${t.isSelected}")
                    }
                    return tracks
                }

                override fun selectAudioTrack(index: Int) {
                    exoPlayer.selectTrackByIndex(C.TRACK_TYPE_AUDIO, index)
                }

                override fun selectSubtitleTrack(index: Int) {
                    Log.d(TAG, "selectSubtitleTrack: index=$index")
                    if (index < 0) {
                        Log.d(TAG, "selectSubtitleTrack: disabling text tracks")
                        exoPlayer.trackSelectionParameters = exoPlayer.trackSelectionParameters
                            .buildUpon()
                            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                            .build()
                        return
                    }
                    exoPlayer.trackSelectionParameters = exoPlayer.trackSelectionParameters
                        .buildUpon()
                        .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                        .build()
                    exoPlayer.selectTrackByIndex(C.TRACK_TYPE_TEXT, index)
                    Log.d(TAG, "selectSubtitleTrack: after selection, textDisabled=${exoPlayer.trackSelectionParameters.disabledTrackTypes.contains(C.TRACK_TYPE_TEXT)}")
                    exoPlayer.logCurrentTracks("after selectSubtitleTrack")
                }

                override fun setSubtitleUri(url: String) {
                    Log.d(TAG, "setSubtitleUri: url=$url")
                    subtitleSelectionJob?.cancel()
                    subtitleSelectionJob = coroutineScope.launch {
                        val currentPosition = exoPlayer.currentPosition
                        val wasPlaying = exoPlayer.isPlaying
                        val currentMediaItem = exoPlayer.currentMediaItem ?: run {
                            Log.e(TAG, "setSubtitleUri: currentMediaItem is null, aborting")
                            return@launch
                        }
                        val resolvedMime = withContext(Dispatchers.IO) {
                            resolveSubtitleMimeType(url)
                        }
                        Log.d(TAG, "setSubtitleUri: currentPosition=$currentPosition, wasPlaying=$wasPlaying")
                        val subtitleConfig = MediaItem.SubtitleConfiguration.Builder(Uri.parse(url))
                            .setMimeType(resolvedMime)
                            .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                            .setRoleFlags(C.ROLE_FLAG_SUBTITLE)
                            .build()
                        Log.d(
                            TAG,
                            "setSubtitleUri: subtitleConfig built, uri=${subtitleConfig.uri}, mime=${subtitleConfig.mimeType}, selectionFlags=${subtitleConfig.selectionFlags}"
                        )
                        val newMediaItem = currentMediaItem.buildUpon()
                            .setSubtitleConfigurations(listOf(subtitleConfig))
                            .build()
                        Log.d(TAG, "setSubtitleUri: newMediaItem subtitleConfigs count=${newMediaItem.localConfiguration?.subtitleConfigurations?.size}")
                        exoPlayer.trackSelectionParameters = exoPlayer.trackSelectionParameters
                            .buildUpon()
                            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                            .clearOverridesOfType(C.TRACK_TYPE_TEXT)
                            .setPreferredTextRoleFlags(C.ROLE_FLAG_SUBTITLE)
                            .build()
                        Log.d(TAG, "setSubtitleUri: track params set before prepare, textDisabled=${exoPlayer.trackSelectionParameters.disabledTrackTypes.contains(C.TRACK_TYPE_TEXT)}")
                        exoPlayer.setMediaItem(newMediaItem, currentPosition)
                        exoPlayer.prepare()
                        exoPlayer.playWhenReady = wasPlaying
                        Log.d(TAG, "setSubtitleUri: prepare() called, waiting for STATE_READY")
                    }
                }

                override fun clearExternalSubtitle() {
                    Log.d(TAG, "clearExternalSubtitle called")
                    val currentPosition = exoPlayer.currentPosition
                    val wasPlaying = exoPlayer.isPlaying
                    val currentMediaItem = exoPlayer.currentMediaItem ?: return
                    val newMediaItem = currentMediaItem.buildUpon()
                        .setSubtitleConfigurations(emptyList())
                        .build()
                    exoPlayer.setMediaItem(newMediaItem, currentPosition)
                    exoPlayer.prepare()
                    exoPlayer.playWhenReady = wasPlaying
                    Log.d(TAG, "clearExternalSubtitle: done, position=$currentPosition")
                }

                override fun clearExternalSubtitleAndSelect(trackIndex: Int) {
                    Log.d(TAG, "clearExternalSubtitleAndSelect: trackIndex=$trackIndex")
                    pendingSubtitleTrackIndex.clear()
                    pendingSubtitleTrackIndex.add(trackIndex)
                    val currentPosition = exoPlayer.currentPosition
                    val wasPlaying = exoPlayer.isPlaying
                    val currentMediaItem = exoPlayer.currentMediaItem ?: return
                    val newMediaItem = currentMediaItem.buildUpon()
                        .setSubtitleConfigurations(emptyList())
                        .build()
                    exoPlayer.setMediaItem(newMediaItem, currentPosition)
                    exoPlayer.prepare()
                    exoPlayer.playWhenReady = wasPlaying
                    Log.d(TAG, "clearExternalSubtitleAndSelect: done, pending=$trackIndex position=$currentPosition")
                }

                override fun applySubtitleStyle(style: SubtitleStyleState) {
                    currentSubtitleStyle = style
                    playerViewRef?.applySubtitleStyle(style)
                }
            }
        )
    }

    LaunchedEffect(exoPlayer) {
        while (isActive) {
            latestOnSnapshot.value(exoPlayer.snapshot())
            delay(250L)
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { viewContext ->
            PlayerView(viewContext).apply {
                useController = useNativeController
                layoutParams = android.view.ViewGroup.LayoutParams(MATCH_PARENT, MATCH_PARENT)
                player = exoPlayer
                keepScreenOn = true
                this.resizeMode = resizeMode.toExoResizeMode()
                setShutterBackgroundColor(android.graphics.Color.BLACK)
                playerViewRef = this
                syncLibassOverlay(
                    player = exoPlayer,
                    enabled = useLibass,
                    renderType = libassRenderType,
                )
                applySubtitleStyle(currentSubtitleStyle)
            }
        },
        update = { playerView ->
            playerView.player = exoPlayer
            playerView.useController = useNativeController
            playerView.resizeMode = resizeMode.toExoResizeMode()
            playerViewRef = playerView
            playerView.syncLibassOverlay(
                player = exoPlayer,
                enabled = useLibass,
                renderType = libassRenderType,
            )
            playerView.applySubtitleStyle(currentSubtitleStyle)
        },
    )
}

private tailrec fun Context.findActivity(): Activity? =
    when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }

private fun ExoPlayer.snapshot(): PlayerPlaybackSnapshot =
    PlayerPlaybackSnapshot(
        isLoading = playbackState == Player.STATE_IDLE || playbackState == Player.STATE_BUFFERING,
        isPlaying = isPlaying,
        isEnded = playbackState == Player.STATE_ENDED,
        durationMs = duration.coerceAtLeast(0L),
        positionMs = currentPosition.coerceAtLeast(0L),
        bufferedPositionMs = bufferedPosition.coerceAtLeast(0L),
        playbackSpeed = playbackParameters.speed,
    )

private fun PlayerResizeMode.toExoResizeMode(): Int =
    when (this) {
        PlayerResizeMode.Fit -> AspectRatioFrameLayout.RESIZE_MODE_FIT
        PlayerResizeMode.Fill -> AspectRatioFrameLayout.RESIZE_MODE_FILL
        PlayerResizeMode.Zoom -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
    }

private fun PlayerView.syncLibassOverlay(
    player: ExoPlayer,
    enabled: Boolean,
    renderType: LibassRenderType,
) {
    val containerId = if (renderType == LibassRenderType.OVERLAY_OPEN_GL) {
        R.id.libass_overlay_container_gl
    } else {
        R.id.libass_overlay_container
    }
    val overlayContainer = findViewById<android.widget.FrameLayout>(containerId) ?: return
    val needsOverlay = enabled && renderType.usesOverlaySubtitleView()
    val boundPlayer = getTag(R.id.libass_overlay_bound_player) as? ExoPlayer
    val hasOverlayChild = overlayContainer.hasAssOverlayChild()

    if (!needsOverlay) {
        if (hasOverlayChild) {
            overlayContainer.removeAssOverlayChildren()
        }
        if (boundPlayer != null) {
            setTag(R.id.libass_overlay_bound_player, null)
        }
        return
    }

    val assHandler = player.getAssHandlerCompat() ?: return
    if (boundPlayer === player && hasOverlayChild) {
        return
    }

    overlayContainer.removeAssOverlayChildren()
    val assSubtitleView = AssSubtitleView(overlayContainer.context, assHandler)
    overlayContainer.addView(
        assSubtitleView,
        android.widget.FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT)
    )
    setTag(R.id.libass_overlay_bound_player, player)
}

private fun LibassRenderType.usesOverlaySubtitleView(): Boolean =
    this == LibassRenderType.OVERLAY_CANVAS || this == LibassRenderType.OVERLAY_OPEN_GL

private fun android.widget.FrameLayout.hasAssOverlayChild(): Boolean {
    for (index in 0 until childCount) {
        if (getChildAt(index) is AssSubtitleView) {
            return true
        }
    }
    return false
}

private fun android.widget.FrameLayout.removeAssOverlayChildren() {
    for (index in childCount - 1 downTo 0) {
        if (getChildAt(index) is AssSubtitleView) {
            removeViewAt(index)
        }
    }
}

private fun PlayerView.applySubtitleStyle(style: SubtitleStyleState) {
    subtitleView?.apply {
        val baseBottomPaddingFraction = SubtitleView.DEFAULT_BOTTOM_PADDING_FRACTION * 2f / 3f
        val offsetFraction = (style.bottomOffset / 1000f).coerceIn(0f, 0.2f)
        val bottomPaddingFraction = (baseBottomPaddingFraction + offsetFraction).coerceIn(0f, 0.4f)

        setApplyEmbeddedStyles(false)
        setApplyEmbeddedFontSizes(false)
        setBottomPaddingFraction(bottomPaddingFraction)
        setStyle(
            CaptionStyleCompat(
                style.textColor.toArgb(),
                android.graphics.Color.TRANSPARENT,
                android.graphics.Color.TRANSPARENT,
                if (style.outlineEnabled) CaptionStyleCompat.EDGE_TYPE_OUTLINE else CaptionStyleCompat.EDGE_TYPE_NONE,
                android.graphics.Color.BLACK,
                Typeface.DEFAULT,
            )
        )
        setFixedTextSize(TypedValue.COMPLEX_UNIT_SP, style.fontSizeSp.toFloat())
    }
}

private fun ExoPlayer.extractAudioTracks(): List<AudioTrack> {
    val tracks = mutableListOf<AudioTrack>()
    var idx = 0
    for (group in currentTracks.groups) {
        if (group.type != C.TRACK_TYPE_AUDIO) continue
        val format = group.mediaTrackGroup.getFormat(0)
        val channelLabel = when {
            format.channelCount == 1 -> "Mono"
            format.channelCount == 2 -> "Stereo"
            format.channelCount == 6 -> "5.1"
            format.channelCount == 8 -> "7.1"
            format.channelCount > 0 -> "${format.channelCount}ch"
            else -> null
        }
        val mime = format.sampleMimeType?.lowercase()
        val codecLabel = when {
            mime == null -> null
            mime.contains("eac3-joc") -> "Dolby Atmos"
            mime.contains("truehd") && format.channelCount >= 8 -> "Dolby Atmos"
            mime.contains("truehd") -> "Dolby TrueHD"
            mime.contains("eac3") -> "Dolby Digital Plus"
            mime.contains("ac3") -> "Dolby Digital"
            mime.contains("opus") -> "Opus"
            mime.contains("aac") -> "AAC"
            mime.contains("dts-hd") -> "DTS-HD"
            mime.contains("dts") -> "DTS"
            else -> null
        }
        val resolvedLanguage = format.language?.let { lang -> Locale(lang).displayLanguage.takeIf { name -> name.isNotBlank() && name != lang } }
        val baseName = format.label?.takeIf { it.isNotBlank() }
            ?: resolvedLanguage
            ?: format.language
            ?: runBlocking { getString(Res.string.compose_player_track_number, idx + 1) }
        val suffix = listOfNotNull(channelLabel, codecLabel)
            .joinToString(" ")
            .let { if (it.isNotBlank()) " ($it)" else "" }
        tracks.add(
            AudioTrack(
                index = idx,
                id = format.id ?: idx.toString(),
                label = "$baseName$suffix",
                language = format.language,
                isSelected = group.isSelected,
            )
        )
        idx++
    }
    return tracks
}

private fun ExoPlayer.extractSubtitleTracks(): List<SubtitleTrack> {
    val tracks = mutableListOf<SubtitleTrack>()
    var idx = 0
    for (group in currentTracks.groups) {
        if (group.type != C.TRACK_TYPE_TEXT) continue
        val format = group.mediaTrackGroup.getFormat(0)
        val hasForcedSelectionFlag = (format.selectionFlags and C.SELECTION_FLAG_FORCED) != 0
        tracks.add(
            SubtitleTrack(
                index = idx,
                id = format.id ?: idx.toString(),
                label = format.label ?: "",
                language = format.language,
                isSelected = group.isSelected,
                isForced = inferForcedSubtitleTrack(
                    label = format.label,
                    language = format.language,
                    trackId = format.id,
                    hasForcedSelectionFlag = hasForcedSelectionFlag,
                ),
            )
        )
        idx++
    }
    return tracks
}

private fun ExoPlayer.selectTrackByIndex(trackType: Int, targetIndex: Int) {
    val typeName = if (trackType == C.TRACK_TYPE_AUDIO) "AUDIO" else "TEXT"
    Log.d(TAG, "selectTrackByIndex: type=$typeName targetIndex=$targetIndex")
    var idx = 0
    for (group in currentTracks.groups) {
        if (group.type != trackType) continue
        if (idx == targetIndex) {
            val format = group.mediaTrackGroup.getFormat(0)
            Log.d(TAG, "selectTrackByIndex: found group at idx=$idx, format.id=${format.id}, lang=${format.language}, label=${format.label}")
            trackSelectionParameters = trackSelectionParameters
                .buildUpon()
                .setOverrideForType(
                    TrackSelectionOverride(group.mediaTrackGroup, listOf(0))
                )
                .build()
            Log.d(TAG, "selectTrackByIndex: override applied")
            return
        }
        idx++
    }
    Log.w(TAG, "selectTrackByIndex: no group found for type=$typeName at index=$targetIndex (total groups scanned=$idx)")
}

private fun ExoPlayer.logCurrentTracks(context: String) {
    Log.d(TAG, "--- logCurrentTracks ($context) ---")
    Log.d(TAG, "  textDisabled=${trackSelectionParameters.disabledTrackTypes.contains(C.TRACK_TYPE_TEXT)}")
    for (group in currentTracks.groups) {
        val typeName = when (group.type) {
            C.TRACK_TYPE_AUDIO -> "AUDIO"
            C.TRACK_TYPE_TEXT -> "TEXT"
            C.TRACK_TYPE_VIDEO -> "VIDEO"
            else -> "OTHER(${group.type})"
        }
        if (group.type != C.TRACK_TYPE_TEXT && group.type != C.TRACK_TYPE_AUDIO) continue
        val format = group.mediaTrackGroup.getFormat(0)
        Log.d(TAG, "  group type=$typeName id=${format.id} lang=${format.language} label=${format.label} selected=${group.isSelected} supported=${group.isSupported}")
    }
    Log.d(TAG, "--- end logCurrentTracks ---")
}

private fun resolveSubtitleMimeType(url: String): String {
    probeSubtitleHeaders(url)?.let { (contentType, contentDisposition) ->
        mapSubtitleMime(contentType)?.let { return it }
        filenameFromContentDisposition(contentDisposition)?.let(::guessSubtitleMime)?.let { return it }
    }
    return guessSubtitleMime(url)
}

private fun probeSubtitleHeaders(url: String): Pair<String?, String?>? {
    val methods = listOf("HEAD", "GET")
    methods.forEach { method ->
        runCatching {
            val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 5_000
                readTimeout = 5_000
                instanceFollowRedirects = true
                setRequestProperty("Accept", "*/*")
            }
            try {
                connection.responseCode
                connection.contentType to connection.getHeaderField("Content-Disposition")
            } finally {
                connection.disconnect()
            }
        }.getOrNull()?.let { return it }
    }
    return null
}

private fun mapSubtitleMime(contentType: String?): String? {
    val normalized = contentType
        ?.substringBefore(';')
        ?.trim()
        ?.lowercase()
        ?: return null

    return when (normalized) {
        "application/x-subrip",
        "application/srt",
        "text/srt",
        "text/plain" -> MimeTypes.APPLICATION_SUBRIP
        "text/vtt",
        "application/vtt" -> MimeTypes.TEXT_VTT
        "text/x-ssa",
        "text/ssa",
        "text/ass",
        "application/x-ssa" -> MimeTypes.TEXT_SSA
        "application/ttml+xml",
        "text/xml",
        "application/xml" -> MimeTypes.APPLICATION_TTML
        else -> null
    }
}

private fun filenameFromContentDisposition(contentDisposition: String?): String? =
    contentDisposition
        ?.substringAfter("filename=", missingDelimiterValue = "")
        ?.trim()
        ?.trim('"')
        ?.takeIf { it.isNotEmpty() }

private fun guessSubtitleMime(url: String): String {
    val lower = url.lowercase()
    return when {
        lower.contains(".srt") -> MimeTypes.APPLICATION_SUBRIP
        lower.contains(".vtt") || lower.contains(".webvtt") -> MimeTypes.TEXT_VTT
        lower.contains(".ass") || lower.contains(".ssa") -> MimeTypes.TEXT_SSA
        lower.contains(".ttml") || lower.contains(".dfxp") || lower.contains(".xml") -> MimeTypes.APPLICATION_TTML
        else -> MimeTypes.TEXT_VTT
    }
}
