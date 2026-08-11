package com.nuvio.app.features.player

import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Timeline
import androidx.media3.common.TrackGroup
import androidx.media3.common.util.Consumer
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSourceUtil
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import androidx.media3.decoder.DecoderInputBuffer
import androidx.media3.exoplayer.FormatHolder
import androidx.media3.exoplayer.LoadingInfo
import androidx.media3.exoplayer.SeekParameters
import androidx.media3.exoplayer.source.BaseMediaSource
import androidx.media3.exoplayer.source.MediaPeriod
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.SampleStream
import androidx.media3.exoplayer.source.SinglePeriodTimeline
import androidx.media3.exoplayer.source.TrackGroupArray
import androidx.media3.exoplayer.trackselection.AdaptiveTrackSelection
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.exoplayer.trackselection.ExoTrackSelection
import androidx.media3.exoplayer.trackselection.ForwardingTrackSelection
import androidx.media3.exoplayer.upstream.Allocator
import androidx.media3.exoplayer.upstream.BandwidthMeter
import androidx.media3.extractor.text.CueEncoder
import androidx.media3.extractor.text.CuesWithTiming
import androidx.media3.extractor.text.SubtitleParser
import java.nio.charset.Charset
import java.nio.charset.StandardCharsets
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

internal const val DYNAMIC_ADDON_SUBTITLE_TRACK_ID = "${ADDON_SUBTITLE_TRACK_ID_PREFIX}dynamic"
private const val DYNAMIC_ADDON_SUBTITLE_URI = "nuvio-addon-subtitle:dynamic"
private const val SUBTITLE_DETECTION_BYTE_LIMIT = 64 * 1024

internal data class DynamicAddonSubtitleRequest(
    val generation: Long,
    val trackId: String,
    val url: String,
)

internal data class DynamicAddonSubtitleSample(
    val timeUs: Long,
    val durationUs: Long,
    val data: ByteArray,
) {
    val endTimeUs: Long = if (timeUs == C.TIME_UNSET || durationUs == C.TIME_UNSET) {
        C.TIME_UNSET
    } else {
        timeUs + durationUs
    }
}

internal data class DynamicAddonSubtitleContent(
    val mimeType: String,
    val samples: List<DynamicAddonSubtitleSample>,
)

internal data class DynamicAddonSubtitleSnapshot(
    val generation: Long,
    val streamRevision: Long,
    val request: DynamicAddonSubtitleRequest?,
    val content: DynamicAddonSubtitleContent?,
)

/** Holds exactly one active addon selection and its parsed samples for the current video source. */
internal class DynamicAddonSubtitleState {
    @Volatile
    private var currentSnapshot = DynamicAddonSubtitleSnapshot(
        generation = 0L,
        streamRevision = 0L,
        request = null,
        content = null,
    )

    @Volatile
    private var onStreamRevisionChanged: (() -> Unit)? = null

    fun setOnStreamRevisionChanged(listener: (() -> Unit)?) {
        onStreamRevisionChanged = listener
    }

    fun beginSelection(trackId: String, url: String): DynamicAddonSubtitleRequest {
        val request: DynamicAddonSubtitleRequest
        synchronized(this) {
            request = DynamicAddonSubtitleRequest(
                generation = currentSnapshot.generation + 1L,
                trackId = trackId,
                url = url,
            )
            currentSnapshot = DynamicAddonSubtitleSnapshot(
                generation = request.generation,
                streamRevision = currentSnapshot.streamRevision + 1L,
                request = request,
                content = null,
            )
        }
        onStreamRevisionChanged?.invoke()
        return request
    }

    fun publish(
        request: DynamicAddonSubtitleRequest,
        content: DynamicAddonSubtitleContent,
    ): Boolean {
        val published = synchronized(this) {
            if (currentSnapshot.request != request) {
                false
            } else {
                currentSnapshot = currentSnapshot.copy(
                    streamRevision = currentSnapshot.streamRevision + 1L,
                    content = content,
                )
                true
            }
        }
        if (published) onStreamRevisionChanged?.invoke()
        return published
    }

    fun clear() {
        val cleared = synchronized(this) {
            if (currentSnapshot.request == null && currentSnapshot.content == null) {
                false
            } else {
                currentSnapshot = DynamicAddonSubtitleSnapshot(
                    generation = currentSnapshot.generation + 1L,
                    streamRevision = currentSnapshot.streamRevision + 1L,
                    request = null,
                    content = null,
                )
                true
            }
        }
        if (cleared) onStreamRevisionChanged?.invoke()
    }

    fun snapshot(): DynamicAddonSubtitleSnapshot = currentSnapshot
}

@OptIn(UnstableApi::class)
internal fun loadDynamicAddonSubtitleContent(
    request: DynamicAddonSubtitleRequest,
    dataSourceFactory: DataSource.Factory,
    parserFactory: SubtitleParser.Factory,
): DynamicAddonSubtitleContent {
    val dataSource = dataSourceFactory.createDataSource()
    return try {
        readDynamicAddonSubtitleContent(request, dataSource, parserFactory)
    } finally {
        dataSource.close()
    }
}

/** Serializes loads and closes the active data source when a newer selection supersedes it. */
internal class DynamicAddonSubtitleLoader(
    private val dataSourceFactory: DataSource.Factory,
    private val parserFactory: () -> SubtitleParser.Factory,
) {
    private val loadMutex = Mutex()
    private val activeDataSourceLock = Any()
    private var activeDataSource: DataSource? = null

    suspend fun load(request: DynamicAddonSubtitleRequest): DynamicAddonSubtitleContent =
        loadMutex.withLock {
            coroutineContext.ensureActive()
            val dataSource = dataSourceFactory.createDataSource()
            synchronized(activeDataSourceLock) {
                activeDataSource = dataSource
            }
            try {
                val subtitleParserFactory = parserFactory()
                try {
                    runInterruptible(Dispatchers.IO) {
                        readDynamicAddonSubtitleContent(request, dataSource, subtitleParserFactory)
                    }
                } catch (error: Exception) {
                    coroutineContext.ensureActive()
                    throw error
                }
            } finally {
                synchronized(activeDataSourceLock) {
                    if (activeDataSource === dataSource) activeDataSource = null
                }
                runCatching { dataSource.close() }
            }
        }

    fun cancelActive() {
        val dataSource = synchronized(activeDataSourceLock) { activeDataSource }
        runCatching { dataSource?.close() }
    }
}

@OptIn(UnstableApi::class)
private fun readDynamicAddonSubtitleContent(
    request: DynamicAddonSubtitleRequest,
    dataSource: DataSource,
    parserFactory: SubtitleParser.Factory,
): DynamicAddonSubtitleContent {
    val bytes = run {
        dataSource.open(
            DataSpec.Builder()
                .setUri(Uri.parse(request.url))
                .setFlags(DataSpec.FLAG_ALLOW_GZIP)
                .build(),
        )
        DataSourceUtil.readToEnd(dataSource)
    }

    val mimeType = detectSideLoadedSubtitleMimeType(bytes)
    val sourceFormat = Format.Builder()
        .setId(request.trackId)
        .setSampleMimeType(mimeType)
        .setRoleFlags(C.ROLE_FLAG_SUBTITLE)
        .build()
    val parser = parserFactory.create(sourceFormat)
    val cueEncoder = CueEncoder()
    val samples = mutableListOf<DynamicAddonSubtitleSample>()
    try {
        parser.parse(
            bytes,
            SubtitleParser.OutputOptions.allCues(),
            Consumer<CuesWithTiming> { cues ->
                samples += DynamicAddonSubtitleSample(
                    timeUs = cues.startTimeUs,
                    durationUs = cues.durationUs,
                    data = cueEncoder.encode(cues.cues, cues.durationUs),
                )
            },
        )
    } finally {
        parser.reset()
    }
    samples.sortBy { it.timeUs }
    return DynamicAddonSubtitleContent(
        mimeType = mimeType,
        samples = samples,
    )
}

/** Invalidates only the dynamic text selection when its stream revision changes. */
@OptIn(UnstableApi::class)
internal class DynamicAddonSubtitleTrackSelector(
    context: Context,
    state: DynamicAddonSubtitleState,
) : DefaultTrackSelector(
    context,
    DynamicAddonSubtitleTrackSelectionFactory(state),
) {
    fun invalidateAddonSubtitleSelection() {
        invalidate()
    }
}

@OptIn(UnstableApi::class)
private class DynamicAddonSubtitleTrackSelectionFactory(
    private val state: DynamicAddonSubtitleState,
) : ExoTrackSelection.Factory {
    private val delegate = AdaptiveTrackSelection.Factory()

    override fun createTrackSelections(
        definitions: Array<out ExoTrackSelection.Definition?>,
        bandwidthMeter: BandwidthMeter,
        mediaPeriodId: MediaSource.MediaPeriodId,
        timeline: Timeline,
    ): Array<ExoTrackSelection?> {
        val selections = delegate.createTrackSelections(
            definitions,
            bandwidthMeter,
            mediaPeriodId,
            timeline,
        )
        return Array(selections.size) { index ->
            selections[index]?.let { selection ->
                if (selection.trackGroup.isDynamicAddonSubtitleTrackGroup()) {
                    RevisionTrackSelection(selection, state.snapshot().streamRevision)
                } else {
                    selection
                }
            }
        }
    }
}

/** Makes only the dynamic text selection non-equivalent after a content revision. */
@OptIn(UnstableApi::class)
private class RevisionTrackSelection(
    selection: ExoTrackSelection,
    private val streamRevision: Long,
) : ForwardingTrackSelection(selection) {
    override fun equals(other: Any?): Boolean =
        other is RevisionTrackSelection &&
            streamRevision == other.streamRevision &&
            wrappedInstance == other.wrappedInstance

    override fun hashCode(): Int = 31 * wrappedInstance.hashCode() + streamRevision.hashCode()
}

private fun TrackGroup.isDynamicAddonSubtitleTrackGroup(): Boolean =
    id == DYNAMIC_ADDON_SUBTITLE_TRACK_ID ||
        (0 until length).any { index ->
            matchesAddonSubtitleTrackId(getFormat(index).id, DYNAMIC_ADDON_SUBTITLE_TRACK_ID)
        }

/** A permanent merged child with one stable, picker-hidden addon text track. */
@OptIn(UnstableApi::class)
internal class DynamicAddonSubtitleMediaSource(
    private val state: DynamicAddonSubtitleState,
) : BaseMediaSource() {
    private val mediaItem = MediaItem.fromUri(Uri.parse(DYNAMIC_ADDON_SUBTITLE_URI))
    private val timeline = SinglePeriodTimeline(
        C.TIME_UNSET,
        true,
        false,
        false,
        null,
        mediaItem,
    )

    override fun getMediaItem(): MediaItem = mediaItem

    override fun prepareSourceInternal(mediaTransferListener: TransferListener?) {
        refreshSourceInfo(timeline)
    }

    override fun maybeThrowSourceInfoRefreshError() = Unit

    override fun createPeriod(
        id: MediaSource.MediaPeriodId,
        allocator: Allocator,
        startPositionUs: Long,
    ): MediaPeriod = DynamicAddonSubtitleMediaPeriod(state)

    override fun releasePeriod(mediaPeriod: MediaPeriod) {
        (mediaPeriod as DynamicAddonSubtitleMediaPeriod).release()
    }

    override fun releaseSourceInternal() = Unit
}

/** Supplies revision-scoped text streams while remaining fully buffered to the player. */
@OptIn(UnstableApi::class)
internal class DynamicAddonSubtitleMediaPeriod(
    private val state: DynamicAddonSubtitleState,
) : MediaPeriod {
    private val format = Format.Builder()
        .setId(DYNAMIC_ADDON_SUBTITLE_TRACK_ID)
        .setSampleMimeType(MimeTypes.APPLICATION_MEDIA3_CUES)
        .setCueReplacementBehavior(Format.CUE_REPLACEMENT_BEHAVIOR_MERGE)
        .setRoleFlags(C.ROLE_FLAG_SUBTITLE)
        .build()
    private val trackGroup = TrackGroup(DYNAMIC_ADDON_SUBTITLE_TRACK_ID, format)
    private val trackGroups = TrackGroupArray(trackGroup)
    private val activeStreams = mutableSetOf<DynamicAddonSubtitleSampleStream>()

    override fun prepare(callback: MediaPeriod.Callback, positionUs: Long) {
        callback.onPrepared(this)
    }

    override fun maybeThrowPrepareError() = Unit

    override fun getTrackGroups(): TrackGroupArray = trackGroups

    @Suppress("UNCHECKED_CAST")
    override fun selectTracks(
        selections: Array<out ExoTrackSelection?>,
        mayRetainStreamFlags: BooleanArray,
        streams: Array<out SampleStream?>,
        streamResetFlags: BooleanArray,
        positionUs: Long,
    ): Long {
        val mutableStreams = streams as Array<SampleStream?>
        for (index in selections.indices) {
            val selection = selections[index]
            val selectsDynamicTrack = selection?.trackGroup == trackGroup
            if (!selectsDynamicTrack) {
                (streams[index] as? DynamicAddonSubtitleSampleStream)?.let(activeStreams::remove)
                mutableStreams[index] = null
                continue
            }

            val currentStream = streams[index] as? DynamicAddonSubtitleSampleStream
            val streamRevision = state.snapshot().streamRevision
            if (
                currentStream == null ||
                !mayRetainStreamFlags[index] ||
                currentStream.streamRevision != streamRevision
            ) {
                currentStream?.let(activeStreams::remove)
                val newStream = DynamicAddonSubtitleSampleStream(
                    state = state,
                    streamRevision = streamRevision,
                    format = format,
                    startPositionUs = positionUs,
                )
                activeStreams += newStream
                mutableStreams[index] = newStream
                streamResetFlags[index] = true
            }
        }
        return positionUs
    }

    override fun discardBuffer(positionUs: Long, toKeyframe: Boolean) = Unit

    override fun readDiscontinuity(): Long = C.TIME_UNSET

    override fun seekToUs(positionUs: Long): Long {
        activeStreams.forEach { stream -> stream.seekToUs(positionUs) }
        return positionUs
    }

    override fun getAdjustedSeekPositionUs(positionUs: Long, seekParameters: SeekParameters): Long =
        positionUs

    override fun getBufferedPositionUs(): Long = C.TIME_END_OF_SOURCE

    override fun getNextLoadPositionUs(): Long = C.TIME_END_OF_SOURCE

    override fun continueLoading(loadingInfo: LoadingInfo): Boolean = false

    override fun isLoading(): Boolean = false

    override fun reevaluateBuffer(positionUs: Long) = Unit

    fun release() {
        activeStreams.clear()
    }
}

/** Reads the one currently published cue set, beginning at the active playback position. */
@OptIn(UnstableApi::class)
internal class DynamicAddonSubtitleSampleStream(
    private val state: DynamicAddonSubtitleState,
    val streamRevision: Long,
    private val format: Format,
    startPositionUs: Long,
) : SampleStream {
    private var formatSent = false
    private var readIndex = 0
    private var seekPositionUs = startPositionUs
    private var initializedContent: DynamicAddonSubtitleContent? = null

    override fun isReady(): Boolean = true

    override fun maybeThrowError() = Unit

    override fun readData(
        formatHolder: FormatHolder,
        buffer: DecoderInputBuffer,
        readFlags: Int,
    ): Int {
        if ((readFlags and SampleStream.FLAG_REQUIRE_FORMAT) != 0 || !formatSent) {
            formatHolder.format = format
            if ((readFlags and SampleStream.FLAG_PEEK) == 0) {
                formatSent = true
            }
            return C.RESULT_FORMAT_READ
        }

        val snapshot = state.snapshot()
        if (snapshot.streamRevision != streamRevision || snapshot.request == null) {
            return C.RESULT_NOTHING_READ
        }
        val content = snapshot.content ?: return C.RESULT_NOTHING_READ
        ensureContentInitialized(content)
        val sample = content.samples.getOrNull(readIndex)
        if (sample == null) {
            buffer.addFlag(C.BUFFER_FLAG_END_OF_STREAM)
            return C.RESULT_BUFFER_READ
        }

        buffer.timeUs = sample.timeUs
        buffer.addFlag(C.BUFFER_FLAG_KEY_FRAME)
        if ((readFlags and SampleStream.FLAG_OMIT_SAMPLE_DATA) == 0) {
            buffer.ensureSpaceForWrite(sample.data.size)
            buffer.data!!.put(sample.data)
        }
        if ((readFlags and SampleStream.FLAG_PEEK) == 0) {
            readIndex += 1
        }
        return C.RESULT_BUFFER_READ
    }

    override fun skipData(positionUs: Long): Int {
        val content = state.snapshot().content ?: return 0
        ensureContentInitialized(content)
        val startIndex = readIndex
        while (readIndex < content.samples.size && content.samples[readIndex].timeUs < positionUs) {
            readIndex += 1
        }
        return readIndex - startIndex
    }

    fun seekToUs(positionUs: Long) {
        seekPositionUs = positionUs
        initializedContent = null
    }

    private fun ensureContentInitialized(content: DynamicAddonSubtitleContent) {
        if (initializedContent === content) return
        initializedContent = content
        readIndex = content.samples.indexOfFirst { sample ->
            sample.endTimeUs == C.TIME_UNSET || sample.endTimeUs >= seekPositionUs
        }.let { index -> if (index < 0) content.samples.size else index }
    }
}

internal fun detectSideLoadedSubtitleMimeType(
    data: ByteArray,
    offset: Int = 0,
    length: Int = data.size - offset,
): String {
    val safeOffset = offset.coerceIn(0, data.size)
    val safeLength = length.coerceIn(0, data.size - safeOffset)
    val detectionLength = minOf(safeLength, SUBTITLE_DETECTION_BYTE_LIMIT)
    val charset = detectSubtitleCharset(data, safeOffset, detectionLength)
    val text = String(data, safeOffset, detectionLength, charset).trimStart('\uFEFF', ' ', '\t', '\r', '\n')

    return when {
        text.startsWith("WEBVTT", ignoreCase = true) -> MimeTypes.TEXT_VTT
        text.contains("[Script Info]", ignoreCase = true) ||
            text.contains("[Events]", ignoreCase = true) ||
            text.lineSequence().any { it.trimStart().startsWith("Dialogue:", ignoreCase = true) } ->
            MimeTypes.TEXT_SSA
        Regex("<(?:(?:[A-Za-z][\\w.-]*):)?tt(?:\\s|>)", RegexOption.IGNORE_CASE).containsMatchIn(text) ->
            MimeTypes.APPLICATION_TTML
        Regex("(?m)^\\s*(?:\\d+\\s*)?\\R?\\s*\\d{1,3}:\\d{2}:\\d{2}[,.]\\d{1,3}\\s*-->\\s*\\d{1,3}:\\d{2}:\\d{2}[,.]\\d{1,3}").containsMatchIn(text) ->
            MimeTypes.APPLICATION_SUBRIP
        else -> MimeTypes.APPLICATION_SUBRIP
    }
}

private fun detectSubtitleCharset(data: ByteArray, offset: Int, length: Int): Charset = when {
    length >= 2 && data[offset] == 0xFF.toByte() && data[offset + 1] == 0xFE.toByte() ->
        StandardCharsets.UTF_16LE
    length >= 2 && data[offset] == 0xFE.toByte() && data[offset + 1] == 0xFF.toByte() ->
        StandardCharsets.UTF_16BE
    else -> StandardCharsets.UTF_8
}
