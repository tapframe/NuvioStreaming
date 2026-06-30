package com.nuvio.app.features.player

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.text.SpannableString
import android.net.Uri
import android.util.Log
import android.util.TypedValue
import android.graphics.Typeface
import android.os.Build
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.util.AttributeSet
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
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.text.Cue
import androidx.media3.common.text.CueGroup
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.TransferListener
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.ForwardingRenderer
import androidx.media3.exoplayer.Renderer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.text.TextOutput
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.extractor.DefaultExtractorsFactory
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory
import androidx.media3.extractor.ts.TsExtractor
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import androidx.media3.ui.SubtitleView
import androidx.media3.ui.CaptionStyleCompat
import com.nuvio.app.R
import com.nuvio.app.features.streams.normalizeStreamType
import `is`.xyz.mpv.BaseMPVView
import `is`.xyz.mpv.MPV
import `is`.xyz.mpv.MPVNode
import `is`.xyz.mpv.Utils
import io.github.peerless2012.ass.media.widget.AssSubtitleView
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

private const val TAG = "NuvioPlayer"

@androidx.annotation.OptIn(UnstableApi::class)
@Composable
actual fun PlatformPlayerSurface(
    sourceUrl: String,
    sourceAudioUrl: String?,
    sourceHeaders: Map<String, String>,
    sourceResponseHeaders: Map<String, String>,
    externalSubtitles: List<com.nuvio.app.features.streams.StreamSubtitle>,
    streamType: String?,
    useYoutubeChunkedPlayback: Boolean,
    modifier: Modifier,
    playWhenReady: Boolean,
    resizeMode: PlayerResizeMode,
    useNativeController: Boolean,
    onControllerReady: (PlayerEngineController) -> Unit,
    onSnapshot: (PlayerPlaybackSnapshot) -> Unit,
    onError: (String?) -> Unit,
) {
    val playerSettings = remember {
        PlayerSettingsRepository.ensureLoaded()
        PlayerSettingsRepository.uiState.value
    }
    val playerSourceKey = listOf(
        sourceUrl,
        sourceAudioUrl.orEmpty(),
        sanitizePlaybackHeaders(sourceHeaders),
        sanitizePlaybackResponseHeaders(sourceResponseHeaders),
        normalizeStreamType(streamType).orEmpty(),
        useYoutubeChunkedPlayback,
    )
    var activeEngine by remember(playerSourceKey, playerSettings.androidPlaybackEngine) {
        mutableStateOf(playerSettings.androidPlaybackEngine.initialAndroidEngine())
    }

    when (activeEngine) {
        ResolvedAndroidPlaybackEngine.ExoPlayer -> ExoPlayerSurface(
            sourceUrl = sourceUrl,
            sourceAudioUrl = sourceAudioUrl,
            sourceHeaders = sourceHeaders,
            sourceResponseHeaders = sourceResponseHeaders,
            externalSubtitles = externalSubtitles,
            streamType = streamType,
            useYoutubeChunkedPlayback = useYoutubeChunkedPlayback,
            modifier = modifier,
            playWhenReady = playWhenReady,
            resizeMode = resizeMode,
            useNativeController = useNativeController,
            onControllerReady = onControllerReady,
            onSnapshot = onSnapshot,
            onError = { message ->
                if (message != null && playerSettings.androidPlaybackEngine == AndroidPlaybackEngine.Auto) {
                    Log.w(TAG, "ExoPlayer failed; falling back to libmpv: $message")
                    activeEngine = ResolvedAndroidPlaybackEngine.Libmpv
                    onError(null)
                } else {
                    onError(message)
                }
            },
        )
        ResolvedAndroidPlaybackEngine.Libmpv -> LibmpvPlayerSurface(
            sourceUrl = sourceUrl,
            sourceAudioUrl = sourceAudioUrl,
            sourceHeaders = sourceHeaders,
            externalSubtitles = externalSubtitles,
            modifier = modifier,
            playWhenReady = playWhenReady,
            resizeMode = resizeMode,
            videoOutput = playerSettings.androidLibmpvVideoOutput,
            hardwareDecodingEnabled = playerSettings.androidLibmpvHardwareDecodingEnabled,
            yuv420pEnabled = playerSettings.androidLibmpvYuv420pEnabled,
            onControllerReady = onControllerReady,
            onSnapshot = onSnapshot,
            onError = onError,
        )
    }
}

private enum class ResolvedAndroidPlaybackEngine {
    ExoPlayer,
    Libmpv,
}

private fun AndroidPlaybackEngine.initialAndroidEngine(): ResolvedAndroidPlaybackEngine =
    when (this) {
        AndroidPlaybackEngine.Auto,
        AndroidPlaybackEngine.ExoPlayer -> ResolvedAndroidPlaybackEngine.ExoPlayer
        AndroidPlaybackEngine.Libmpv -> ResolvedAndroidPlaybackEngine.Libmpv
    }

@androidx.annotation.OptIn(UnstableApi::class)
@Composable
private fun ExoPlayerSurface(
    sourceUrl: String,
    sourceAudioUrl: String?,
    sourceHeaders: Map<String, String>,
    sourceResponseHeaders: Map<String, String>,
    externalSubtitles: List<com.nuvio.app.features.streams.StreamSubtitle>,
    streamType: String?,
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
    val latestPlayWhenReady = rememberUpdatedState(playWhenReady)
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
    val normalizedStreamType = remember(streamType) {
        normalizeStreamType(streamType)
    }
    val useLibass = playerSettings.useLibass
    val libassRenderType = runCatching {
        LibassRenderType.valueOf(playerSettings.libassRenderType)
    }.getOrDefault(LibassRenderType.CUES)
    val playerSourceKey = listOf(
        sourceUrl,
        sourceAudioUrl.orEmpty(),
        sanitizedSourceHeaders,
        sanitizedSourceResponseHeaders,
        normalizedStreamType.orEmpty(),
        useYoutubeChunkedPlayback,
    )
    var subtitleDelayMs by remember(playerSourceKey) { mutableStateOf(0) }
    var selectedExternalSubtitleMimeType by remember(playerSourceKey) { mutableStateOf<String?>(null) }
    val latestSubtitleDelayMs = rememberUpdatedState(subtitleDelayMs)
    val latestExternalSubtitleMimeType = rememberUpdatedState(selectedExternalSubtitleMimeType)
    var decoderPriorityOverride by remember(playerSourceKey) { mutableStateOf<Int?>(null) }
    var fallbackStartPositionMs by remember(playerSourceKey) { mutableStateOf<Long?>(null) }
    val effectiveDecoderPriority = decoderPriorityOverride ?: playerSettings.decoderPriority

    val initialMediaItem = remember(playerSourceKey, externalSubtitles) {
        val subtitleConfigs = externalSubtitles.mapNotNull { subtitle ->
            val mimeType = resolveSubtitleMimeType(subtitle.url, subtitle.headers)
            MediaItem.SubtitleConfiguration.Builder(Uri.parse(subtitle.url))
                .setMimeType(mimeType)
                .setLanguage(subtitle.language)
                .setLabel(subtitle.name ?: subtitle.language)
                .setRoleFlags(C.ROLE_FLAG_SUBTITLE)
                .build()
        }
        playbackMediaItemFromUrl(
            url = sourceUrl,
            responseHeaders = sanitizedSourceResponseHeaders,
            streamType = normalizedStreamType,
        ).buildUpon()
            .setMediaId(sourceUrl)
            .apply {
                if (subtitleConfigs.isNotEmpty()) {
                    setSubtitleConfigurations(subtitleConfigs)
                }
            }
            .build()
    }

    var resolvedMediaItem by remember(playerSourceKey) { mutableStateOf(initialMediaItem) }
    var probeAttempted by remember(playerSourceKey) { mutableStateOf(false) }

    val extractorsFactory = remember {
        DefaultExtractorsFactory()
            .setTsExtractorFlags(DefaultTsPayloadReaderFactory.FLAG_ENABLE_HDMV_DTS_AUDIO_STREAMS)
            .setTsExtractorTimestampSearchBytes(1500 * TsExtractor.TS_PACKET_SIZE)
    }
    val dataSourceFactory = remember(
        context,
        sanitizedSourceHeaders,
        sanitizedSourceResponseHeaders,
        useYoutubeChunkedPlayback,
        externalSubtitles,
    ) {
        PlatformPlaybackDataSourceFactory.create(
            context = context,
            defaultRequestHeaders = sanitizedSourceHeaders,
            defaultResponseHeaders = sanitizedSourceResponseHeaders,
            useYoutubeChunkedPlayback = useYoutubeChunkedPlayback,
            externalSubtitles = externalSubtitles,
        )
    }

    fun ExoPlayer.setPlaybackMediaItem(videoMediaItem: MediaItem, startPositionMs: Long? = null) {
        if (!sourceAudioUrl.isNullOrBlank()) {
            val mediaSourceFactory = DefaultMediaSourceFactory(dataSourceFactory, extractorsFactory)
            val videoSource = mediaSourceFactory.createMediaSource(videoMediaItem)
            val audioSource = mediaSourceFactory.createMediaSource(playbackMediaItemFromUrl(sourceAudioUrl))
            val mergedSource = MergingMediaSource(videoSource, audioSource)
            if (startPositionMs != null) {
                setMediaSource(mergedSource, startPositionMs.coerceAtLeast(0L))
            } else {
                setMediaSource(mergedSource)
            }
        } else if (startPositionMs != null) {
            setMediaItem(videoMediaItem, startPositionMs.coerceAtLeast(0L))
        } else {
            setMediaItem(videoMediaItem)
        }
    }

    val exoPlayer = remember(
        sourceUrl,
        sourceAudioUrl,
        sanitizedSourceHeaders,
        sanitizedSourceResponseHeaders,
        normalizedStreamType,
        useYoutubeChunkedPlayback,
        effectiveDecoderPriority,
    ) {
        val renderersFactory = SubtitleOffsetRenderersFactory(
            context = context,
            subtitleDelayUsProvider = { latestSubtitleDelayMs.value.toLong() * 1_000L },
            shouldNormalizeCuePositionProvider = {
                latestExternalSubtitleMimeType.value == MimeTypes.TEXT_VTT
            },
        )
            .setExtensionRendererMode(effectiveDecoderPriority)
            .setEnableDecoderFallback(true)
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
                15_000,
                70_000,
                DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_MS,
                5_000
            )
            .build()

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

        player
    }

    LaunchedEffect(exoPlayer, resolvedMediaItem) {
        val mediaItem = resolvedMediaItem ?: return@LaunchedEffect
        exoPlayer.setPlaybackMediaItem(mediaItem, fallbackStartPositionMs)
        exoPlayer.prepare()
    }

    val pendingSubtitleTrackIndex = remember { mutableListOf<Int>() }
    val pendingAudioTrackSelection = remember { mutableListOf<TrackSelectionSnapshot>() }
    var playerViewRef by remember { mutableStateOf<PlayerView?>(null) }
    var currentSubtitleStyle by remember { mutableStateOf(SubtitleStyleState.DEFAULT) }
    var subtitleSelectionJob by remember { mutableStateOf<Job?>(null) }

    fun syncPlayerViewKeepScreenOn() {
        playerViewRef?.keepScreenOn = exoPlayer.shouldKeepPlayerScreenOn()
    }

    fun preserveAudioSelectionForReload(reason: String) {
        pendingAudioTrackSelection.clear()
        val selection = exoPlayer.captureSelectedTrack(C.TRACK_TYPE_AUDIO) ?: return
        pendingAudioTrackSelection.add(selection)
        Log.d(TAG, "$reason: preserving audio track index=${selection.index} id=${selection.id}")
    }

    DisposableEffect(exoPlayer) {
        PlayerPictureInPictureManager.registerPausePlaybackCallback {
            exoPlayer.pause()
        }

        fun reportPlayerError(error: PlaybackException) {
            if (
                playerSettings.decoderPriority == DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON &&
                effectiveDecoderPriority != DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER &&
                error.isDecoderFailure()
            ) {
                Log.w(
                    TAG,
                    "Decoder failure (${error.errorCodeName}); retrying with app decoders",
                    error,
                )
                fallbackStartPositionMs = exoPlayer.currentPosition.coerceAtLeast(0L)
                decoderPriorityOverride = DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER
                latestOnError.value(null)
                return
            }
            latestOnError.value(error.localizedMessage ?: runBlocking { getString(Res.string.player_unable_to_play_stream) })
        }

        val listener = object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                syncPlayerViewKeepScreenOn()

                val isSourceError = error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW ||
                        error.errorCode == PlaybackException.ERROR_CODE_IO_UNSPECIFIED ||
                        error.cause?.toString()?.contains("UnrecognizedInputFormatException") == true

                if (isSourceError && !probeAttempted) {
                    probeAttempted = true
                    coroutineScope.launch {
                        val probedMime = withContext(Dispatchers.IO) {
                            probeMimeType(sourceUrl, sanitizedSourceHeaders)
                        }
                        if (probedMime != null) {
                            Log.d(TAG, "Playback failed with source error. Probed MIME type: $probedMime. Retrying...")
                            resolvedMediaItem = MediaItem.Builder()
                                .setUri(sourceUrl)
                                .setMimeType(probedMime)
                                .setMediaId(sourceUrl)
                                .apply {
                                    val subtitleConfigs = externalSubtitles.mapNotNull { subtitle ->
                                        val mimeType = resolveSubtitleMimeType(subtitle.url, subtitle.headers)
                                        MediaItem.SubtitleConfiguration.Builder(Uri.parse(subtitle.url))
                                            .setMimeType(mimeType)
                                            .setLanguage(subtitle.language)
                                            .setLabel(subtitle.name ?: subtitle.language)
                                            .setRoleFlags(C.ROLE_FLAG_SUBTITLE)
                                            .build()
                                    }
                                    if (subtitleConfigs.isNotEmpty()) {
                                        setSubtitleConfigurations(subtitleConfigs)
                                    }
                                }
                                .build()
                            latestOnError.value(null)
                            return@launch
                        }
                        reportPlayerError(error)
                    }
                    return
                }

                reportPlayerError(error)
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
                    fallbackStartPositionMs = null
                    latestOnError.value(null)
                    exoPlayer.logCurrentTracks("STATE_READY")
                }
                syncPlayerViewKeepScreenOn()
                latestOnSnapshot.value(exoPlayer.snapshot())
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                syncPlayerViewKeepScreenOn()
                latestOnSnapshot.value(exoPlayer.snapshot())
            }

            override fun onPlaybackParametersChanged(playbackParameters: androidx.media3.common.PlaybackParameters) {
                latestOnSnapshot.value(exoPlayer.snapshot())
            }

            override fun onTracksChanged(tracks: androidx.media3.common.Tracks) {
                Log.d(TAG, "onTracksChanged: ${tracks.groups.size} groups total")
                exoPlayer.logCurrentTracks("onTracksChanged")
                pendingAudioTrackSelection.firstOrNull()?.let { selection ->
                    if (tracks.groups.any { it.type == C.TRACK_TYPE_AUDIO }) {
                        pendingAudioTrackSelection.clear()
                        val restored = exoPlayer.restoreTrackSelection(selection)
                        Log.d(TAG, "onTracksChanged: restored pending audio selection=$restored")
                    }
                }
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
            playerViewRef?.keepScreenOn = false
            subtitleSelectionJob?.cancel()
        }
    }

    DisposableEffect(exoPlayer, lifecycleOwner) {
        val activity = context.findActivity()
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> exoPlayer.playWhenReady = latestPlayWhenReady.value
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
        exoPlayer.playWhenReady = latestPlayWhenReady.value
        syncPlayerViewKeepScreenOn()
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
                    exoPlayer.extractAudioTracks(context)

                override fun getSubtitleTracks(): List<SubtitleTrack> {
                    val tracks = exoPlayer.extractSubtitleTracks(context)
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
                        preserveAudioSelectionForReload("setSubtitleUri")
                        val resolvedMime = withContext(Dispatchers.IO) {
                            resolveSubtitleMimeType(url)
                        }
                        selectedExternalSubtitleMimeType = resolvedMime
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
                        exoPlayer.setPlaybackMediaItem(newMediaItem, currentPosition)
                        exoPlayer.prepare()
                        exoPlayer.playWhenReady = wasPlaying
                        Log.d(TAG, "setSubtitleUri: prepare() called, waiting for STATE_READY")
                    }
                }

                override fun clearExternalSubtitle() {
                    Log.d(TAG, "clearExternalSubtitle called")
                    subtitleSelectionJob?.cancel()
                    selectedExternalSubtitleMimeType = null
                    val currentPosition = exoPlayer.currentPosition
                    val wasPlaying = exoPlayer.isPlaying
                    val currentMediaItem = exoPlayer.currentMediaItem ?: return
                    preserveAudioSelectionForReload("clearExternalSubtitle")
                    val newMediaItem = currentMediaItem.buildUpon()
                        .setSubtitleConfigurations(emptyList())
                        .build()
                    exoPlayer.setPlaybackMediaItem(newMediaItem, currentPosition)
                    exoPlayer.prepare()
                    exoPlayer.playWhenReady = wasPlaying
                    Log.d(TAG, "clearExternalSubtitle: done, position=$currentPosition")
                }

                override fun clearExternalSubtitleAndSelect(trackIndex: Int) {
                    Log.d(TAG, "clearExternalSubtitleAndSelect: trackIndex=$trackIndex")
                    subtitleSelectionJob?.cancel()
                    selectedExternalSubtitleMimeType = null
                    pendingSubtitleTrackIndex.clear()
                    pendingSubtitleTrackIndex.add(trackIndex)
                    val currentPosition = exoPlayer.currentPosition
                    val wasPlaying = exoPlayer.isPlaying
                    val currentMediaItem = exoPlayer.currentMediaItem ?: return
                    preserveAudioSelectionForReload("clearExternalSubtitleAndSelect")
                    val newMediaItem = currentMediaItem.buildUpon()
                        .setSubtitleConfigurations(emptyList())
                        .build()
                    exoPlayer.setPlaybackMediaItem(newMediaItem, currentPosition)
                    exoPlayer.prepare()
                    exoPlayer.playWhenReady = wasPlaying
                    Log.d(TAG, "clearExternalSubtitleAndSelect: done, pending=$trackIndex position=$currentPosition")
                }

                override fun applySubtitleStyle(style: SubtitleStyleState) {
                    currentSubtitleStyle = style
                    playerViewRef?.applySubtitleStyle(style)
                }

                override fun setSubtitleDelayMs(delayMs: Int) {
                    subtitleDelayMs = delayMs.coerceIn(SUBTITLE_DELAY_MIN_MS, SUBTITLE_DELAY_MAX_MS)
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
                keepScreenOn = exoPlayer.shouldKeepPlayerScreenOn()
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
            syncPlayerViewKeepScreenOn()
            playerView.syncLibassOverlay(
                player = exoPlayer,
                enabled = useLibass,
                renderType = libassRenderType,
            )
            playerView.applySubtitleStyle(currentSubtitleStyle)
        },
    )
}

@Composable
private fun LibmpvPlayerSurface(
    sourceUrl: String,
    sourceAudioUrl: String?,
    sourceHeaders: Map<String, String>,
    externalSubtitles: List<com.nuvio.app.features.streams.StreamSubtitle>,
    modifier: Modifier,
    playWhenReady: Boolean,
    resizeMode: PlayerResizeMode,
    videoOutput: AndroidLibmpvVideoOutput,
    hardwareDecodingEnabled: Boolean,
    yuv420pEnabled: Boolean,
    onControllerReady: (PlayerEngineController) -> Unit,
    onSnapshot: (PlayerPlaybackSnapshot) -> Unit,
    onError: (String?) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val latestOnSnapshot = rememberUpdatedState(onSnapshot)
    val latestOnError = rememberUpdatedState(onError)
    val latestPlayWhenReady = rememberUpdatedState(playWhenReady)
    val coroutineScope = rememberCoroutineScope()
    val sanitizedSourceHeaders = remember(sourceHeaders) {
        sanitizePlaybackHeaders(sourceHeaders)
    }
    var playerViewRef by remember { mutableStateOf<NuvioLibmpvView?>(null) }

    DisposableEffect(lifecycleOwner) {
        val activity = context.findActivity()
        val observer = LifecycleEventObserver { _, event ->
            val view = playerViewRef ?: return@LifecycleEventObserver
            when (event) {
                Lifecycle.Event.ON_START -> view.setPaused(!latestPlayWhenReady.value)
                Lifecycle.Event.ON_STOP -> {
                    val isInPictureInPicture =
                        Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && activity?.isInPictureInPictureMode == true
                    val isFinishing = activity?.isFinishing == true
                    if (!isInPictureInPicture || isFinishing) {
                        view.setPaused(true)
                    }
                }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    DisposableEffect(playerViewRef) {
        val view = playerViewRef ?: return@DisposableEffect onDispose {}
        fun dispatchSnapshot(updateKeepScreenOn: Boolean = false) {
            coroutineScope.launch(Dispatchers.Main.immediate) {
                latestOnSnapshot.value(view.snapshot())
                if (updateKeepScreenOn) {
                    view.keepScreenOn = view.shouldKeepScreenOn()
                }
            }
        }
        val observer = object : MPV.EventObserver {
            override fun eventProperty(property: String) = Unit
            override fun eventProperty(property: String, value: Long) {
                if (property == "cache-buffering-state") {
                    dispatchSnapshot(updateKeepScreenOn = true)
                }
            }
            override fun eventProperty(property: String, value: Boolean) {
                if (property == "eof-reached" || property == "pause" || property == "paused-for-cache" || property == "seeking") {
                    dispatchSnapshot(updateKeepScreenOn = true)
                }
            }
            override fun eventProperty(property: String, value: String) = Unit
            override fun eventProperty(property: String, value: Double) {
                if (property == "duration" || property == "time-pos" || property == "speed") {
                    dispatchSnapshot()
                }
            }
            override fun eventProperty(property: String, value: MPVNode) {
                if (property == "track-list") dispatchSnapshot()
            }
            override fun event(eventId: Int, data: MPVNode) {
                when (eventId) {
                    MPV.mpvEvent.MPV_EVENT_START_FILE -> {
                        coroutineScope.launch(Dispatchers.Main.immediate) {
                            latestOnError.value(null)
                            latestOnSnapshot.value(PlayerPlaybackSnapshot())
                        }
                    }
                    MPV.mpvEvent.MPV_EVENT_FILE_LOADED,
                    MPV.mpvEvent.MPV_EVENT_PLAYBACK_RESTART -> {
                        coroutineScope.launch(Dispatchers.Main.immediate) {
                            latestOnError.value(null)
                            latestOnSnapshot.value(view.snapshot())
                        }
                    }
                    MPV.mpvEvent.MPV_EVENT_END_FILE -> dispatchSnapshot()
                }
            }
        }
        view.mpv.addObserver(observer)
        onDispose {
            view.mpv.removeObserver(observer)
        }
    }

    DisposableEffect(playerViewRef) {
        val view = playerViewRef ?: return@DisposableEffect onDispose {}
        PlayerPictureInPictureManager.registerPausePlaybackCallback {
            view.setPaused(true)
        }
        onDispose {
            PlayerPictureInPictureManager.registerPausePlaybackCallback(null)
            view.keepScreenOn = false
        }
    }

    LaunchedEffect(playerViewRef, sourceUrl, sourceAudioUrl, sanitizedSourceHeaders, externalSubtitles) {
        val view = playerViewRef ?: return@LaunchedEffect
        latestOnSnapshot.value(PlayerPlaybackSnapshot())
        view.loadSource(
            sourceUrl = sourceUrl,
            sourceAudioUrl = sourceAudioUrl,
            requestHeaders = sanitizedSourceHeaders,
            externalSubtitles = externalSubtitles,
            playWhenReady = latestPlayWhenReady.value,
        )
    }

    LaunchedEffect(playerViewRef, playWhenReady) {
        val view = playerViewRef ?: return@LaunchedEffect
        view.setPaused(!latestPlayWhenReady.value)
        view.keepScreenOn = view.shouldKeepScreenOn()
        latestOnSnapshot.value(view.snapshot())
    }

    LaunchedEffect(playerViewRef, resizeMode) {
        playerViewRef?.applyResizeMode(resizeMode)
    }

    LaunchedEffect(playerViewRef, sourceUrl, sourceAudioUrl, sanitizedSourceHeaders, externalSubtitles) {
        val view = playerViewRef ?: return@LaunchedEffect
        onControllerReady(view.controller(context))
    }

    LaunchedEffect(playerViewRef) {
        val view = playerViewRef ?: return@LaunchedEffect
        while (isActive) {
            latestOnSnapshot.value(view.snapshot())
            view.keepScreenOn = view.shouldKeepScreenOn()
            delay(250L)
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { viewContext ->
            NuvioLibmpvView(
                context = viewContext,
                videoOutput = videoOutput,
                hardwareDecodingEnabled = hardwareDecodingEnabled,
                yuv420pEnabled = yuv420pEnabled,
            ).apply {
                layoutParams = android.view.ViewGroup.LayoutParams(MATCH_PARENT, MATCH_PARENT)
                keepScreenOn = false
                runCatching {
                    Utils.copyAssets(viewContext)
                    initialize(viewContext.filesDir.path, viewContext.cacheDir.path)
                }.onFailure { error ->
                    Log.e(TAG, "Failed to initialize libmpv", error)
                    latestOnError.value(error.localizedMessage ?: "libmpv unavailable")
                }
                playerViewRef = this
            }
        },
        update = { view ->
            playerViewRef = view
            view.applyResizeMode(resizeMode)
        },
        onRelease = { view ->
            if (playerViewRef === view) playerViewRef = null
            runCatching { view.destroy() }
        },
    )
}

private tailrec fun Context.findActivity(): Activity? =
    when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }

private class NuvioLibmpvView(
    context: Context,
    private val videoOutput: AndroidLibmpvVideoOutput,
    private val hardwareDecodingEnabled: Boolean,
    private val yuv420pEnabled: Boolean,
    attrs: AttributeSet? = null,
) : BaseMPVView(context, attrs) {
    private var currentSourceUrl: String? = null
    private var currentSourceAudioUrl: String? = null
    private var currentRequestHeaders: Map<String, String> = emptyMap()
    private var currentExternalSubtitles: List<com.nuvio.app.features.streams.StreamSubtitle> = emptyList()

    override fun initOptions() {
        setVo(videoOutput.mpvValue)
        mpv.setOptionString("profile", "fast")
        mpv.setOptionString("hwdec", if (hardwareDecodingEnabled) "auto" else "no")
        if (yuv420pEnabled) {
            mpv.setOptionString("vf", "format=yuv420p")
        }
        mpv.setOptionString("msg-level", "all=warn")
        mpv.setOptionString("tls-verify", "yes")
        mpv.setOptionString("tls-ca-file", "${context.filesDir.path}/cacert.pem")
        mpv.setOptionString("demuxer-max-bytes", "${libmpvCacheBytes()}").logIfMpvError("demuxer-max-bytes")
        mpv.setOptionString("demuxer-max-back-bytes", "${libmpvCacheBytes()}").logIfMpvError("demuxer-max-back-bytes")
        mpv.setOptionString("vd-lavc-film-grain", "cpu")
        mpv.setPropertyBoolean("keep-open", true)
        mpv.setPropertyBoolean("input-default-bindings", true)
        mpv.setPropertyBoolean("audio-fallback-to-null", true)
    }

    override fun postInitOptions() = Unit

    override fun observeProperties() {
        val props = mapOf(
            "pause" to MPV.mpvFormat.MPV_FORMAT_FLAG,
            "paused-for-cache" to MPV.mpvFormat.MPV_FORMAT_FLAG,
            "core-idle" to MPV.mpvFormat.MPV_FORMAT_FLAG,
            "eof-reached" to MPV.mpvFormat.MPV_FORMAT_FLAG,
            "seeking" to MPV.mpvFormat.MPV_FORMAT_FLAG,
            "cache-buffering-state" to MPV.mpvFormat.MPV_FORMAT_INT64,
            "duration" to MPV.mpvFormat.MPV_FORMAT_DOUBLE,
            "time-pos" to MPV.mpvFormat.MPV_FORMAT_DOUBLE,
            "demuxer-cache-time" to MPV.mpvFormat.MPV_FORMAT_DOUBLE,
            "speed" to MPV.mpvFormat.MPV_FORMAT_DOUBLE,
            "track-list" to MPV.mpvFormat.MPV_FORMAT_NODE,
        )
        props.forEach { (name, format) -> mpv.observeProperty(name, format) }
    }

    fun loadSource(
        sourceUrl: String,
        sourceAudioUrl: String?,
        requestHeaders: Map<String, String>,
        externalSubtitles: List<com.nuvio.app.features.streams.StreamSubtitle>,
        playWhenReady: Boolean,
    ) {
        val sameSource =
            currentSourceUrl == sourceUrl &&
                currentSourceAudioUrl == sourceAudioUrl &&
                currentRequestHeaders == requestHeaders &&
                currentExternalSubtitles == externalSubtitles
        currentSourceUrl = sourceUrl
        currentSourceAudioUrl = sourceAudioUrl
        currentRequestHeaders = requestHeaders
        currentExternalSubtitles = externalSubtitles
        if (!sameSource) {
            loadCurrentSource(playWhenReady = playWhenReady)
        } else {
            applyRequestHeaders(requestHeaders)
            setPaused(!playWhenReady)
        }
    }

    private fun loadCurrentSource(playWhenReady: Boolean) {
        val sourceUrl = currentSourceUrl ?: return
        applyRequestHeaders(currentRequestHeaders)
        setPaused(!playWhenReady)
        mpv.command("loadfile", sourceUrl, "replace")
        currentSourceAudioUrl?.takeIf { it.isNotBlank() }?.let { sourceAudioUrl ->
            mpv.command("audio-add", sourceAudioUrl, "auto")
        }
        currentExternalSubtitles.forEachIndexed { index, subtitle ->
            val flag = if (index == 0) "auto" else "cached"
            mpv.command("sub-add", subtitle.url, flag)
        }
        setPaused(!playWhenReady)
    }

    fun setPaused(paused: Boolean) {
        runCatching { mpv.setPropertyBoolean("pause", paused) }
    }

    fun snapshot(): PlayerPlaybackSnapshot {
        val paused = mpv.getPropertyBoolean("pause") ?: true
        val pausedForCache = mpv.getPropertyBoolean("paused-for-cache") ?: false
        val idle = mpv.getPropertyBoolean("core-idle") ?: false
        val ended = mpv.getPropertyBoolean("eof-reached") ?: false
        val seeking = mpv.getPropertyBoolean("seeking") ?: false
        val cacheBufferingState = mpv.getPropertyInt("cache-buffering-state")
        val durationMs = mpv.getPropertyDouble("duration").toMillis()
        val positionMs = mpv.getPropertyDouble("time-pos").toMillis()
        val cachePositionMs = mpv.getPropertyDouble("demuxer-cache-time").toMillis()
        val isCacheBuffering = cacheBufferingState != null && cacheBufferingState in 0 until 100
        val isLoading = pausedForCache ||
            (!paused && !ended && (seeking || isCacheBuffering || (idle && durationMs <= 0L)))
        return PlayerPlaybackSnapshot(
            isLoading = isLoading,
            isPlaying = !paused && !isLoading && !idle && !ended,
            isEnded = ended,
            durationMs = durationMs,
            positionMs = positionMs,
            bufferedPositionMs = maxOf(positionMs, cachePositionMs),
            playbackSpeed = (mpv.getPropertyDouble("speed") ?: 1.0).toFloat(),
        )
    }

    fun shouldKeepScreenOn(): Boolean {
        val snapshot = snapshot()
        return snapshot.isPlaying || snapshot.isLoading
    }

    fun applyResizeMode(resizeMode: PlayerResizeMode) {
        when (resizeMode) {
            PlayerResizeMode.Fit -> {
                mpv.setPropertyDouble("panscan", 0.0)
                mpv.setPropertyString("video-aspect-override", "no")
            }
            PlayerResizeMode.Fill -> {
                mpv.setPropertyDouble("panscan", 1.0)
                mpv.setPropertyString("video-aspect-override", "no")
            }
            PlayerResizeMode.Zoom -> {
                mpv.setPropertyDouble("panscan", 0.5)
                mpv.setPropertyString("video-aspect-override", "no")
            }
        }
    }

    fun controller(context: Context): PlayerEngineController =
        object : PlayerEngineController {
            override fun play() = setPaused(false)

            override fun pause() = setPaused(true)

            override fun seekTo(positionMs: Long) {
                mpv.command("seek", (positionMs.coerceAtLeast(0L) / 1000.0).toString(), "absolute")
            }

            override fun seekBy(offsetMs: Long) {
                mpv.command("seek", (offsetMs / 1000.0).toString(), "relative")
            }

            override fun retry() {
                loadCurrentSource(playWhenReady = true)
            }

            override fun setPlaybackSpeed(speed: Float) {
                mpv.setPropertyDouble("speed", speed.coerceIn(0.25f, 4f).toDouble())
            }

            override fun setMuted(muted: Boolean) {
                mpv.setPropertyBoolean("mute", muted)
            }

            override fun getAudioTracks(): List<AudioTrack> =
                extractLibmpvTracks(context, type = "audio").mapIndexed { index, track ->
                    AudioTrack(
                        index = index,
                        id = track.id.toString(),
                        label = track.label,
                        language = track.language,
                        isSelected = track.isSelected,
                    )
                }

            override fun getSubtitleTracks(): List<SubtitleTrack> =
                extractLibmpvTracks(context, type = "sub").mapIndexed { index, track ->
                    SubtitleTrack(
                        index = index,
                        id = track.id.toString(),
                        label = track.label,
                        language = track.language,
                        isSelected = track.isSelected,
                        isForced = track.isForced,
                    )
                }

            override fun selectAudioTrack(index: Int) {
                if (index < 0) {
                    mpv.setPropertyString("aid", "no")
                } else {
                    extractLibmpvTracks(context, type = "audio").getOrNull(index)?.let { track ->
                        mpv.setPropertyInt("aid", track.id)
                    }
                }
            }

            override fun selectSubtitleTrack(index: Int) {
                if (index < 0) {
                    mpv.setPropertyString("sid", "no")
                } else {
                    extractLibmpvTracks(context, type = "sub").getOrNull(index)?.let { track ->
                        mpv.setPropertyInt("sid", track.id)
                    }
                }
            }

            override fun setSubtitleUri(url: String) {
                mpv.command("sub-add", url, "select")
            }

            override fun clearExternalSubtitle() {
                mpv.setPropertyString("sid", "no")
            }

            override fun clearExternalSubtitleAndSelect(trackIndex: Int) {
                selectSubtitleTrack(trackIndex)
            }

            override fun applySubtitleStyle(style: SubtitleStyleState) {
                mpv.setPropertyString("sub-ass-override", "no")
                mpv.setPropertyString("sub-color", style.textColor.toMpvColor())
                mpv.setPropertyString("sub-back-color", style.backgroundColor.toMpvColor())
                mpv.setPropertyString("sub-outline-color", style.outlineColor.toMpvColor())
                mpv.setPropertyString("sub-border-color", style.outlineColor.toMpvColor())
                mpv.setPropertyString("sub-border-style", style.toMpvSubtitleBorderStyle())
                mpv.setPropertyString("sub-bold", if (style.bold) "yes" else "no")
                mpv.setPropertyInt("sub-font-size", style.toMpvSubtitleFontSize())
                mpv.setPropertyInt("sub-outline-size", style.toMpvSubtitleOutlineSize())
                mpv.setPropertyInt("sub-border-size", style.toMpvSubtitleOutlineSize())
                mpv.setPropertyInt("sub-pos", (100 - style.bottomOffset / 10).coerceIn(0, 100))
            }

            override fun setSubtitleDelayMs(delayMs: Int) {
                mpv.setPropertyDouble(
                    "sub-delay",
                    delayMs.coerceIn(SUBTITLE_DELAY_MIN_MS, SUBTITLE_DELAY_MAX_MS) / 1000.0,
                )
            }
        }

    private fun applyRequestHeaders(headers: Map<String, String>) {
        val userAgent = headers.entries.firstOrNull { it.key.equals("User-Agent", ignoreCase = true) }?.value
        if (!userAgent.isNullOrBlank()) {
            mpv.setPropertyString("user-agent", userAgent)
        }
        val serialized = headers
            .filterKeys { !it.equals("User-Agent", ignoreCase = true) }
            .map { (key, value) -> "${key}: ${value.replace(",", "\\,")}" }
            .joinToString(",")
        mpv.setPropertyString("http-header-fields", serialized)
    }

    private fun extractLibmpvTracks(context: Context, type: String): List<LibmpvTrack> {
        val nodes = mpv.getPropertyNode("track-list")?.asArray()?.toList().orEmpty()
        return nodes
            .filter { node -> node.nodeString("type") == type }
            .mapIndexedNotNull { index, node ->
                val id = node.nodeInt("id") ?: return@mapIndexedNotNull null
                val rawLabel = node.nodeString("title")
                    ?: node.nodeString("external-filename")?.substringAfterLast('/')
                    ?: node.nodeString("codec")
                val language = node.nodeString("lang") ?: normalizeLanguageCode(rawLabel)
                val label = rawLabel?.takeIf { it.isNotBlank() }
                    ?: runBlocking { getString(Res.string.compose_player_track_number, index + 1) }
                LibmpvTrack(
                    id = id,
                    label = label,
                    language = language,
                    isSelected = node.nodeBoolean("selected") ?: false,
                    isForced = inferForcedSubtitleTrack(
                        label = label,
                        language = language,
                        trackId = id.toString(),
                        hasForcedSelectionFlag = node.nodeBoolean("forced") ?: false,
                    ),
                )
            }
    }
}

private data class LibmpvTrack(
    val id: Int,
    val label: String,
    val language: String?,
    val isSelected: Boolean,
    val isForced: Boolean,
)

private fun libmpvCacheBytes(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) 64 * 1024 * 1024 else 32 * 1024 * 1024

private fun Int.logIfMpvError(option: String) {
    if (this < 0) Log.w(TAG, "libmpv option failed: $option status=$this")
}

private fun Double?.toMillis(): Long =
    this?.takeIf { it.isFinite() && it > 0.0 }?.let { (it * 1000.0).toLong() } ?: 0L

private fun MPVNode.nodeString(key: String): String? =
    runCatching { this[key]?.asString() }.getOrNull()?.takeIf { it.isNotBlank() }

private fun MPVNode.nodeInt(key: String): Int? =
    runCatching { this[key]?.asInt()?.toInt() }.getOrNull()

private fun MPVNode.nodeBoolean(key: String): Boolean? =
    runCatching { this[key]?.asBoolean() }.getOrNull()

private fun androidx.compose.ui.graphics.Color.toMpvColor(): String {
    val argb = toArgb()
    val alpha = (argb ushr 24) and 0xff
    val red = (argb shr 16) and 0xff
    val green = (argb shr 8) and 0xff
    val blue = argb and 0xff
    return "#%02X%02X%02X%02X".format(alpha, red, green, blue)
}

private fun androidx.compose.ui.graphics.Color.alphaByte(): Int =
    (toArgb() ushr 24) and 0xff

private fun SubtitleStyleState.toMpvSubtitleFontSize(): Int =
    (fontSizeSp * MPV_SUBTITLE_FONT_SIZE_SCALE).toInt().coerceIn(
        MPV_SUBTITLE_FONT_SIZE_MIN,
        MPV_SUBTITLE_FONT_SIZE_MAX,
    )

private fun SubtitleStyleState.toMpvSubtitleOutlineSize(): Int =
    if (!outlineEnabled) 0 else (outlineWidth * MPV_SUBTITLE_OUTLINE_SIZE_SCALE).toInt().coerceAtLeast(1)

private fun SubtitleStyleState.toMpvSubtitleBorderStyle(): String =
    if (outlineEnabled) {
        "outline-and-shadow"
    } else if (backgroundColor.alphaByte() > 0) {
        "opaque-box"
    } else {
        "outline-and-shadow"
    }

private const val MPV_SUBTITLE_FONT_SIZE_SCALE = 55.0 / 18.0
private const val MPV_SUBTITLE_FONT_SIZE_MIN = 36
private const val MPV_SUBTITLE_FONT_SIZE_MAX = 122
private const val MPV_SUBTITLE_OUTLINE_SIZE_SCALE = 1.5

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

private fun ExoPlayer.shouldKeepPlayerScreenOn(): Boolean =
    playerError == null &&
        playWhenReady &&
        playbackState in setOf(Player.STATE_BUFFERING, Player.STATE_READY)

private data class TrackSelectionSnapshot(
    val trackType: Int,
    val index: Int,
    val id: String?,
    val language: String?,
    val label: String?,
    val sampleMimeType: String?,
    val codecs: String?,
    val channelCount: Int,
    val roleFlags: Int,
)

private fun ExoPlayer.captureSelectedTrack(trackType: Int): TrackSelectionSnapshot? {
    var idx = 0
    for (group in currentTracks.groups) {
        if (group.type != trackType) continue
        if (group.isSelected) {
            val format = group.mediaTrackGroup.getFormat(0)
            return TrackSelectionSnapshot(
                trackType = trackType,
                index = idx,
                id = format.id,
                language = format.language,
                label = format.label,
                sampleMimeType = format.sampleMimeType,
                codecs = format.codecs,
                channelCount = format.channelCount,
                roleFlags = format.roleFlags,
            )
        }
        idx++
    }
    return null
}

private fun ExoPlayer.restoreTrackSelection(selection: TrackSelectionSnapshot): Boolean {
    selection.id?.takeIf { it.isNotBlank() }?.let { id ->
        val restored = selectTrackByPredicate(selection.trackType, "id=$id") { _, format ->
            format.id == id
        }
        if (restored) {
            return true
        }
    }

    selection.label?.takeIf { it.isNotBlank() }?.let { label ->
        val restored = selectTrackByPredicate(selection.trackType, "label=$label") { _, format ->
            format.label.equals(label, ignoreCase = true) &&
                (selection.language.isNullOrBlank() ||
                    format.language.equals(selection.language, ignoreCase = true))
        }
        if (restored) {
            return true
        }
    }

    val technicalMatchIndexes = mutableListOf<Int>()
    var idx = 0
    for (group in currentTracks.groups) {
        if (group.type != selection.trackType) continue
        val format = group.mediaTrackGroup.getFormat(0)
        if (
            !selection.language.isNullOrBlank() &&
            format.language.equals(selection.language, ignoreCase = true) &&
            format.sampleMimeType == selection.sampleMimeType &&
            format.codecs == selection.codecs &&
            format.channelCount == selection.channelCount &&
            format.roleFlags == selection.roleFlags
        ) {
            technicalMatchIndexes.add(idx)
        }
        idx++
    }
    if (technicalMatchIndexes.size == 1) {
        return selectTrackByIndex(selection.trackType, technicalMatchIndexes.first())
    }

    return selectTrackByIndex(selection.trackType, selection.index)
}

private fun PlaybackException.isDecoderFailure(): Boolean =
    errorCode in setOf(
        PlaybackException.ERROR_CODE_DECODER_INIT_FAILED,
        PlaybackException.ERROR_CODE_DECODER_QUERY_FAILED,
        PlaybackException.ERROR_CODE_DECODING_FAILED,
        PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES,
        PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED,
        PlaybackException.ERROR_CODE_DECODING_RESOURCES_RECLAIMED,
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
                style.backgroundColor.toArgb(),
                android.graphics.Color.TRANSPARENT,
                if (style.outlineEnabled) CaptionStyleCompat.EDGE_TYPE_OUTLINE else CaptionStyleCompat.EDGE_TYPE_NONE,
                style.outlineColor.toArgb(),
                if (style.bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT,
            )
        )
        setFixedTextSize(TypedValue.COMPLEX_UNIT_SP, style.fontSizeSp.toFloat())
    }
}

private fun ExoPlayer.extractAudioTracks(context: Context): List<AudioTrack> {
    val tracks = mutableListOf<AudioTrack>()
    val trackNameProvider = CustomDefaultTrackNameProvider(context.resources)
    var idx = 0
    for (group in currentTracks.groups) {
        if (group.type != C.TRACK_TYPE_AUDIO) continue
        val format = group.mediaTrackGroup.getFormat(0)
        val label = trackNameProvider.getTrackName(format).takeIf { it.isNotBlank() }
            ?: runBlocking { getString(Res.string.compose_player_track_number, idx + 1) }
        tracks.add(
            AudioTrack(
                index = idx,
                id = format.id ?: idx.toString(),
                label = label,
                language = format.language,
                isSelected = group.isSelected,
            )
        )
        idx++
    }
    return tracks
}

private fun ExoPlayer.extractSubtitleTracks(context: Context): List<SubtitleTrack> {
    val tracks = mutableListOf<SubtitleTrack>()
    val trackNameProvider = CustomDefaultTrackNameProvider(context.resources)
    var idx = 0
    for (group in currentTracks.groups) {
        if (group.type != C.TRACK_TYPE_TEXT) continue
        val format = group.mediaTrackGroup.getFormat(0)
        val hasForcedSelectionFlag = (format.selectionFlags and C.SELECTION_FLAG_FORCED) != 0
        tracks.add(
            SubtitleTrack(
                index = idx,
                id = format.id ?: idx.toString(),
                label = trackNameProvider.getTrackName(format),
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

private fun ExoPlayer.selectTrackByIndex(trackType: Int, targetIndex: Int): Boolean {
    return selectTrackByPredicate(trackType, "index=$targetIndex") { idx, _ ->
        idx == targetIndex
    }
}

private fun ExoPlayer.selectTrackByPredicate(
    trackType: Int,
    targetDescription: String,
    predicate: (index: Int, format: Format) -> Boolean,
): Boolean {
    val typeName = if (trackType == C.TRACK_TYPE_AUDIO) "AUDIO" else "TEXT"
    Log.d(TAG, "selectTrack: type=$typeName target=$targetDescription")
    var idx = 0
    for (group in currentTracks.groups) {
        if (group.type != trackType) continue
        val format = group.mediaTrackGroup.getFormat(0)
        if (!predicate(idx, format)) {
            idx++
            continue
        }
        Log.d(TAG, "selectTrack: found group at idx=$idx, format.id=${format.id}, lang=${format.language}, label=${format.label}")
        trackSelectionParameters = trackSelectionParameters
            .buildUpon()
            .setOverrideForType(
                TrackSelectionOverride(group.mediaTrackGroup, listOf(0))
            )
            .build()
        Log.d(TAG, "selectTrack: override applied")
        return true
    }
    Log.w(TAG, "selectTrack: no group found for type=$typeName target=$targetDescription (total groups scanned=$idx)")
    return false
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

@androidx.annotation.OptIn(UnstableApi::class)
private class SubtitleOffsetRenderersFactory(
    context: Context,
    private val subtitleDelayUsProvider: () -> Long,
    private val shouldNormalizeCuePositionProvider: () -> Boolean,
) : DefaultRenderersFactory(context) {
    override fun buildTextRenderers(
        context: Context,
        output: TextOutput,
        outputLooper: android.os.Looper,
        extensionRendererMode: Int,
        out: ArrayList<Renderer>,
    ) {
        val normalizingOutput = CueNormalizingTextOutput(
            delegate = output,
            shouldNormalizeCuePositionProvider = shouldNormalizeCuePositionProvider,
        )
        val startIndex = out.size
        super.buildTextRenderers(context, normalizingOutput, outputLooper, extensionRendererMode, out)
        for (index in startIndex until out.size) {
            out[index] = SubtitleOffsetRenderer(
                baseRenderer = out[index],
                subtitleDelayUsProvider = subtitleDelayUsProvider,
            )
        }
    }
}

private class CueNormalizingTextOutput(
    private val delegate: TextOutput,
    private val shouldNormalizeCuePositionProvider: () -> Boolean,
) : TextOutput {
    override fun onCues(cueGroup: CueGroup) {
        val processed = cueGroup.cues.map(::processCue)
        delegate.onCues(CueGroup(processed, cueGroup.presentationTimeUs))
    }

    @Deprecated("Uses the deprecated Media3 callback for text outputs.")
    override fun onCues(cues: List<Cue>) {
        delegate.onCues(cues.map(::processCue))
    }

    private fun processCue(cue: Cue): Cue {
        var processed = fixRtlCueText(cue)
        if (shouldNormalizeCuePositionProvider()) {
            processed = normalizeCuePosition(processed)
        }
        return processed
    }

    private fun normalizeCuePosition(cue: Cue): Cue {
        if (cue.bitmap != null || cue.verticalType != Cue.TYPE_UNSET || cue.line == Cue.DIMEN_UNSET) {
            return cue
        }
        return cue.buildUpon()
            .setLine(Cue.DIMEN_UNSET, Cue.TYPE_UNSET)
            .setLineAnchor(Cue.TYPE_UNSET)
            .build()
    }

    private fun fixRtlCueText(cue: Cue): Cue {
        val text = cue.text ?: return cue
        if (!containsRtlChars(text)) return cue
        val original = text.toString()
        val fixed = original.split('\n').joinToString("\n") { line ->
            moveLeadingRtlPunctuationToEnd(line)
        }
        if (fixed == original) return cue
        return cue.buildUpon().setText(SpannableString(fixed)).build()
    }

    private fun moveLeadingRtlPunctuationToEnd(line: String): String {
        if (line.isEmpty()) return line
        var end = 0
        while (end < line.length && line[end] in RTL_PUNCTUATION) end++
        if (end == 0) return line
        return line.substring(end) + line.substring(0, end)
    }

    private fun containsRtlChars(text: CharSequence): Boolean {
        for (char in text) {
            val directionality = Character.getDirectionality(char)
            if (
                directionality == Character.DIRECTIONALITY_RIGHT_TO_LEFT ||
                directionality == Character.DIRECTIONALITY_RIGHT_TO_LEFT_ARABIC
            ) {
                return true
            }
        }
        return false
    }

    companion object {
        private val RTL_PUNCTUATION = setOf('.', ',', '?', '!', '-', ':', ';', '…', ')', '(')
    }
}

@androidx.annotation.OptIn(UnstableApi::class)
private class SubtitleOffsetRenderer(
    baseRenderer: Renderer,
    private val subtitleDelayUsProvider: () -> Long,
) : ForwardingRenderer(baseRenderer) {
    override fun render(positionUs: Long, elapsedRealtimeUs: Long) {
        val adjustedPositionUs = (positionUs - subtitleDelayUsProvider()).coerceAtLeast(0L)
        super.render(adjustedPositionUs, elapsedRealtimeUs)
    }
}

private fun resolveSubtitleMimeType(url: String, headers: Map<String, String>? = null): String {
    probeSubtitleHeaders(url, headers)?.let { (contentType, contentDisposition) ->
        mapSubtitleMime(contentType)?.let { return it }
        filenameFromContentDisposition(contentDisposition)?.let(::guessSubtitleMime)?.let { return it }
    }
    return guessSubtitleMime(url)
}

private fun probeSubtitleHeaders(url: String, headers: Map<String, String>? = null): Pair<String?, String?>? {
    val methods = listOf("HEAD", "GET")
    methods.forEach { method ->
        runCatching {
            val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 5_000
                readTimeout = 5_000
                instanceFollowRedirects = true
                setRequestProperty("Accept", "*/*")
                headers?.forEach { (key, value) ->
                    setRequestProperty(key, value)
                }
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

internal class SubtitleRequestHeaderDataSourceFactory(
    private val upstreamFactory: DataSource.Factory,
    private val externalSubtitles: List<com.nuvio.app.features.streams.StreamSubtitle>,
) : DataSource.Factory {
    override fun createDataSource(): DataSource =
        SubtitleRequestHeaderDataSource(
            upstream = upstreamFactory.createDataSource(),
            externalSubtitles = externalSubtitles,
        )
}

internal class SubtitleRequestHeaderDataSource(
    private val upstream: DataSource,
    private val externalSubtitles: List<com.nuvio.app.features.streams.StreamSubtitle>,
) : DataSource {
    override fun addTransferListener(transferListener: TransferListener) {
        upstream.addTransferListener(transferListener)
    }

    override fun open(dataSpec: DataSpec): Long {
        val url = dataSpec.uri.toString()
        val subtitle = externalSubtitles.find { it.url == url }
        val headers = subtitle?.headers
        
        return if (headers.isNullOrEmpty()) {
            upstream.open(dataSpec)
        } else {
            val mergedHeaders = dataSpec.httpRequestHeaders.toMutableMap()
            headers.forEach { (key, value) ->
                mergedHeaders[key] = value
            }
            upstream.open(dataSpec.buildUpon().setHttpRequestHeaders(mergedHeaders).build())
        }
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int =
        upstream.read(buffer, offset, length)

    override fun getUri(): Uri? = upstream.uri

    override fun getResponseHeaders(): Map<String, List<String>> = upstream.responseHeaders

    override fun close() {
        upstream.close()
    }
}
