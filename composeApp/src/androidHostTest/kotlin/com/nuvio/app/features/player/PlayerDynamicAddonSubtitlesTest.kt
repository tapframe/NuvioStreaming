package com.nuvio.app.features.player

import android.net.Uri
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.text.Cue
import androidx.media3.common.text.CueGroup
import androidx.media3.datasource.ByteArrayDataSource
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import androidx.media3.decoder.DecoderInputBuffer
import androidx.media3.exoplayer.FormatHolder
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.MediaPeriod
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.source.SampleStream
import androidx.media3.exoplayer.source.SilenceMediaSource
import androidx.media3.exoplayer.source.WrappingMediaSource
import androidx.media3.exoplayer.trackselection.ExoTrackSelection
import androidx.media3.exoplayer.trackselection.FixedTrackSelection
import androidx.media3.exoplayer.upstream.Allocator
import androidx.media3.extractor.ExtractorsFactory
import androidx.media3.extractor.text.CueEncoder
import androidx.media3.extractor.text.DefaultSubtitleParserFactory
import androidx.media3.extractor.text.SubtitleExtractor
import androidx.media3.extractor.text.SubtitleParser
import java.time.Duration
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotSame
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowSystemClock

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PlayerDynamicAddonSubtitlesTest {

    @Test
    fun detectsSupportedTextSubtitleFormatsFromDownloadedBytes() {
        assertEquals(
            "application/x-subrip",
            detectSideLoadedSubtitleMimeType("1\n00:00:01,000 --> 00:00:02,000\nHello".encodeToByteArray()),
        )
        assertEquals(
            "text/vtt",
            detectSideLoadedSubtitleMimeType("\uFEFFWEBVTT\n\n00:01.000 --> 00:02.000\nHello".encodeToByteArray()),
        )
        assertEquals(
            "text/x-ssa",
            detectSideLoadedSubtitleMimeType("[Script Info]\n[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello".encodeToByteArray()),
        )
        assertEquals(
            "application/ttml+xml",
            detectSideLoadedSubtitleMimeType("<?xml version=\"1.0\"?><tt xmlns=\"http://www.w3.org/ns/ttml\"><body /></tt>".encodeToByteArray()),
        )
    }

    @Test
    fun unknownTextFallsBackToSubRipBecauseAddonResultsArePredominantlySrt() {
        assertEquals(
            "application/x-subrip",
            detectSideLoadedSubtitleMimeType("not enough data to identify the format".encodeToByteArray()),
        )
    }

    @Test
    fun dynamicLoaderParsesEverySupportedAddonSubtitleFormat() {
        val fixtures = mapOf(
            MimeTypes.APPLICATION_SUBRIP to
                "1\n00:00:01,000 --> 00:00:02,000\nHello",
            MimeTypes.TEXT_VTT to
                "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello",
            MimeTypes.TEXT_SSA to
                """
                [Script Info]
                ScriptType: v4.00+

                [Events]
                Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
                Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello
                """.trimIndent(),
            MimeTypes.APPLICATION_TTML to
                """
                <?xml version="1.0" encoding="UTF-8"?>
                <tt xmlns="http://www.w3.org/ns/ttml">
                  <body><div><p begin="00:00:01.000" end="00:00:02.000">Hello</p></div></body>
                </tt>
                """.trimIndent(),
        )

        fixtures.forEach { (expectedMimeType, fixture) ->
            val content = loadDynamicAddonSubtitleContent(
                request = DynamicAddonSubtitleRequest(
                    generation = 1L,
                    trackId = "addon:$expectedMimeType",
                    url = "https://subs.example/subtitle",
                ),
                dataSourceFactory = DataSource.Factory {
                    ByteArrayDataSource(fixture.encodeToByteArray())
                },
                parserFactory = DefaultSubtitleParserFactory(),
            )

            assertEquals(expectedMimeType, content.mimeType)
            assertTrue(content.samples.isNotEmpty(), expectedMimeType)
        }
    }

    @Test
    fun dynamicSelectionKeepsSignedUrlExact() {
        val state = DynamicAddonSubtitleState()
        val signedUrl = "https://subs.example/file/42?token=a%2Bb&expires=4102444800"

        val request = state.beginSelection(
            trackId = "addon:a",
            url = signedUrl,
        )

        assertEquals(signedUrl, request.url)
        assertEquals(signedUrl, state.snapshot().request?.url)
    }

    @Test
    fun staleLoadCannotReplaceTheLatestSelection() {
        val state = DynamicAddonSubtitleState()
        val first = state.beginSelection("addon:a", "https://subs.example/a")
        val second = state.beginSelection("addon:b", "https://subs.example/b")
        val firstContent = dynamicContent("A")
        val secondContent = dynamicContent("B")

        assertFalse(state.publish(first, firstContent))
        assertNull(state.snapshot().content)
        assertTrue(state.publish(second, secondContent))

        assertEquals("addon:b", state.snapshot().request?.trackId)
        assertEquals("B", state.snapshot().content?.samples?.single()?.data?.decodeToString())
    }

    @Test
    fun oneHundredUniqueSelectionsRetainOnlyTheCurrentContent() {
        val state = DynamicAddonSubtitleState()

        repeat(100) { index ->
            val request = state.beginSelection(
                trackId = "addon:$index",
                url = "https://subs.example/$index?token=signed-$index",
            )
            assertNull(state.snapshot().content)
            assertTrue(state.publish(request, dynamicContent(index.toString())))
        }

        val snapshot = state.snapshot()
        assertEquals(100L, snapshot.generation)
        assertEquals(200L, snapshot.streamRevision)
        assertEquals("addon:99", snapshot.request?.trackId)
        assertEquals("99", snapshot.content?.samples?.single()?.data?.decodeToString())
    }

    @Test
    fun clearInvalidatesInFlightLoadAndReleasesLoadedContent() {
        val state = DynamicAddonSubtitleState()
        val request = state.beginSelection("addon:a", "https://subs.example/a")
        assertTrue(state.publish(request, dynamicContent("A")))

        state.clear()

        assertNull(state.snapshot().request)
        assertNull(state.snapshot().content)
        assertFalse(state.publish(request, dynamicContent("late A")))
    }

    @Test
    fun sampleStreamWaitsWithoutEndingThenEmitsPublishedContent() {
        val state = DynamicAddonSubtitleState()
        val request = state.beginSelection("addon:a", "https://subs.example/a")
        val stream = DynamicAddonSubtitleSampleStream(
            state = state,
            streamRevision = state.snapshot().streamRevision,
            format = dynamicFormat(),
            startPositionUs = 0L,
        )
        val formatHolder = FormatHolder()
        val buffer = DecoderInputBuffer(DecoderInputBuffer.BUFFER_REPLACEMENT_MODE_NORMAL)

        assertEquals(C.RESULT_FORMAT_READ, stream.readData(formatHolder, buffer, 0))
        assertEquals(C.RESULT_NOTHING_READ, stream.readData(formatHolder, buffer, 0))
        assertTrue(state.publish(request, dynamicContent("A")))
        assertEquals(C.RESULT_NOTHING_READ, stream.readData(formatHolder, buffer, 0))
        val loadedStream = DynamicAddonSubtitleSampleStream(
            state = state,
            streamRevision = state.snapshot().streamRevision,
            format = dynamicFormat(),
            startPositionUs = 0L,
        )
        assertEquals(C.RESULT_FORMAT_READ, loadedStream.readData(formatHolder, buffer, 0))
        assertEquals(C.RESULT_BUFFER_READ, loadedStream.readData(formatHolder, buffer, 0))
        buffer.flip()
        assertContentEquals("A".encodeToByteArray(), buffer.data!!.let { bytes ->
            ByteArray(bytes.remaining()).also(bytes::get)
        })

        buffer.clear()
        assertEquals(C.RESULT_BUFFER_READ, loadedStream.readData(formatHolder, buffer, 0))
        assertTrue(buffer.isEndOfStream)
    }

    @Test
    fun generationChangeRecreatesOnlyTheDynamicPeriodStreamAtTheSamePosition() {
        val state = DynamicAddonSubtitleState()
        state.beginSelection("addon:a", "https://subs.example/a")
        val period = DynamicAddonSubtitleMediaPeriod(state)
        val selection = FixedTrackSelection(period.trackGroups[0], 0)
        val selections = arrayOf<ExoTrackSelection?>(selection)
        val streams = arrayOfNulls<SampleStream>(1)
        val resets = BooleanArray(1)

        assertEquals(12_345_000L, period.selectTracks(selections, booleanArrayOf(false), streams, resets, 12_345_000L))
        val firstStream = streams.single()
        assertTrue(resets.single())

        state.beginSelection("addon:b", "https://subs.example/b")
        resets[0] = false
        assertEquals(12_345_000L, period.selectTracks(selections, booleanArrayOf(false), streams, resets, 12_345_000L))

        assertNotSame(firstStream, streams.single())
        assertTrue(resets.single())
    }

    @Test
    fun loaderPassesTheExactSignedUrlToTheDataSource() {
        val signedUrl = "https://subs.example/file/42?token=a%2Bb&expires=4102444800"
        var openedUrl: String? = null
        val upstream = ByteArrayDataSource(
            "1\n00:00:01,000 --> 00:00:02,000\nHello".encodeToByteArray(),
        )
        val dataSourceFactory = DataSource.Factory {
            object : DataSource {
                override fun addTransferListener(transferListener: TransferListener) {
                    upstream.addTransferListener(transferListener)
                }

                override fun open(dataSpec: DataSpec): Long {
                    openedUrl = dataSpec.uri.toString()
                    return upstream.open(dataSpec)
                }

                override fun read(buffer: ByteArray, offset: Int, length: Int): Int =
                    upstream.read(buffer, offset, length)

                override fun getUri(): Uri? = upstream.uri

                override fun close() = upstream.close()
            }
        }
        val parserFactory = object : SubtitleParser.Factory {
            override fun supportsFormat(format: Format): Boolean = true
            override fun getCueReplacementBehavior(format: Format): Int =
                Format.CUE_REPLACEMENT_BEHAVIOR_MERGE
            override fun create(format: Format): SubtitleParser = object : SubtitleParser {
                override fun parse(
                    data: ByteArray,
                    offset: Int,
                    length: Int,
                    outputOptions: SubtitleParser.OutputOptions,
                    output: androidx.media3.common.util.Consumer<androidx.media3.extractor.text.CuesWithTiming>,
                ) = Unit

                override fun getCueReplacementBehavior(): Int = Format.CUE_REPLACEMENT_BEHAVIOR_MERGE
            }
        }

        loadDynamicAddonSubtitleContent(
            request = DynamicAddonSubtitleRequest(1L, "addon:a", signedUrl),
            dataSourceFactory = dataSourceFactory,
            parserFactory = parserFactory,
        )

        assertEquals(signedUrl, openedUrl)
    }

    @Test
    fun loaderClosesSupersededReadAndNeverRunsTwoLoadsAtOnce() = runBlocking {
        val firstOpened = CountDownLatch(1)
        val firstClosed = CountDownLatch(1)
        val createdCount = AtomicInteger()
        val activeCount = AtomicInteger()
        val maxActiveCount = AtomicInteger()
        val factory = DataSource.Factory {
            val ordinal = createdCount.getAndIncrement()
            object : DataSource {
                private val closed = AtomicBoolean()

                override fun addTransferListener(transferListener: TransferListener) = Unit

                override fun open(dataSpec: DataSpec): Long {
                    val active = activeCount.incrementAndGet()
                    maxActiveCount.updateAndGet { current -> maxOf(current, active) }
                    if (ordinal == 0) {
                        firstOpened.countDown()
                        firstClosed.await(5, TimeUnit.SECONDS)
                    }
                    return 0L
                }

                override fun read(buffer: ByteArray, offset: Int, length: Int): Int = C.RESULT_END_OF_INPUT

                override fun getUri(): Uri? = null

                override fun close() {
                    if (closed.compareAndSet(false, true)) {
                        activeCount.decrementAndGet()
                        if (ordinal == 0) firstClosed.countDown()
                    }
                }
            }
        }
        val loader = DynamicAddonSubtitleLoader(factory) { noOpParserFactory() }
        val first = async(Dispatchers.Default) {
            loader.load(DynamicAddonSubtitleRequest(1L, "addon:a", "https://subs.example/a"))
        }
        assertTrue(firstOpened.await(5, TimeUnit.SECONDS))

        first.cancel()
        loader.cancelActive()
        val second = async(Dispatchers.Default) {
            loader.load(DynamicAddonSubtitleRequest(2L, "addon:b", "https://subs.example/b"))
        }

        second.await()
        try {
            first.await()
        } catch (_: CancellationException) {
            // Expected: cancellation plus close releases the superseded blocking read.
        }
        assertEquals(1, maxActiveCount.get())
        assertEquals(0, activeCount.get())
    }

    @Test
    fun exoPlayerSwitchesOneHundredUniqueSubtitlesWithoutBufferingOrSourceReplacement() {
        val context = RuntimeEnvironment.getApplication()
        val state = DynamicAddonSubtitleState()
        val trackSelector = DynamicAddonSubtitleTrackSelector(context, state)
        state.setOnStreamRevisionChanged(trackSelector::invalidateAddonSubtitleSelection)
        val player = ExoPlayer.Builder(context)
            .setTrackSelector(trackSelector)
            .build()
        val playbackStates = mutableListOf<Int>()
        val videoSource = CountingMediaSource(SilenceMediaSource(60_000_000L))
        var mediaItemTransitions = 0
        var timelineChanges = 0
        var trackChanges = 0
        var renderedTexts = emptyList<String>()
        player.addListener(
            object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    playbackStates += playbackState
                }

                override fun onMediaItemTransition(mediaItem: androidx.media3.common.MediaItem?, reason: Int) {
                    mediaItemTransitions += 1
                }

                override fun onTracksChanged(tracks: androidx.media3.common.Tracks) {
                    trackChanges += 1
                }

                override fun onTimelineChanged(timeline: androidx.media3.common.Timeline, reason: Int) {
                    timelineChanges += 1
                }

                override fun onCues(cueGroup: CueGroup) {
                    renderedTexts = cueGroup.cues.mapNotNull { it.text?.toString() }
                }
            },
        )

        try {
            player.setMediaSource(
                MergingMediaSource(
                    videoSource,
                    internalSubtitleMediaSource("internal"),
                    DynamicAddonSubtitleMediaSource(state),
                ),
            )
            player.prepare()
            awaitCondition { player.playbackState == Player.STATE_READY }
            awaitCondition(diagnostic = { player.trackSummary() }) {
                player.currentTracks.groups.any { group ->
                    group.type == C.TRACK_TYPE_TEXT && !group.isDynamicAddonSubtitleGroup()
                }
            }
            val internalTrackIdsBefore = player.internalTrackIds()
            assertEquals(listOf("internal-subtitle"), internalTrackIdsBefore)
            assertEquals(1, player.dynamicAddonTrackCount())
            assertFalse(player.dynamicTrackIsSelected())
            player.pause()
            player.seekTo(5_000L)
            awaitCondition { player.currentPosition == 5_000L }
            val audioBefore = selectedAudioSignature(player)
            assertNotNull(audioBefore)
            playbackStates.clear()
            mediaItemTransitions = 0
            timelineChanges = 0

            repeat(100) { index ->
                val request = state.beginSelection(
                    trackId = "addon:$index",
                    url = "https://subs.example/$index?token=signed-$index",
                )
                selectDynamicTrack(player)
                assertTrue(state.publish(request, renderedContent(index.toString())))
                awaitCondition(timeoutMs = 10_000L, diagnostic = {
                    "index=$index revision=${state.snapshot().streamRevision} " +
                        "rendered=$renderedTexts ${player.trackSummary()} " +
                        "state=${player.playbackState} error=${player.playerError?.errorCodeName}"
                }) { renderedTexts == listOf(index.toString()) }
            }

            selectAndPublishAddon(player, state, "addon:a", "A")
            awaitCondition { renderedTexts == listOf("A") }
            selectAndPublishAddon(player, state, "addon:b", "B")
            awaitCondition { renderedTexts == listOf("B") }
            selectAndPublishAddon(player, state, "addon:a", "A again")
            awaitCondition { renderedTexts == listOf("A again") }

            state.clear()
            selectInternalTrack(player)
            awaitCondition(diagnostic = { player.trackSummary() }) {
                player.internalTrackIsSelected() && renderedTexts == listOf("internal")
            }
            selectAndPublishAddon(player, state, "addon:a", "A after internal")
            awaitCondition { renderedTexts == listOf("A after internal") }

            state.clear()
            disableTextTracks(player)
            awaitCondition(diagnostic = { "rendered=$renderedTexts ${player.trackSummary()}" }) {
                player.currentTracks.groups.none { it.type == C.TRACK_TYPE_TEXT && it.isSelected } &&
                    renderedTexts.isEmpty()
            }
            selectAndPublishAddon(player, state, "addon:a", "A after off")
            awaitCondition { renderedTexts == listOf("A after off") }

            val supersededPending = state.beginSelection(
                "addon:pending",
                "https://subs.example/pending",
            )
            selectDynamicTrack(player)
            awaitCondition(diagnostic = { "rendered=$renderedTexts ${player.trackSummary()}" }) {
                renderedTexts.isEmpty()
            }
            val rapidA = state.beginSelection("addon:rapid-a", "https://subs.example/rapid-a")
            val rapidB = state.beginSelection("addon:rapid-b", "https://subs.example/rapid-b")
            val rapidC = state.beginSelection("addon:rapid-c", "https://subs.example/rapid-c")
            selectDynamicTrack(player)
            assertFalse(state.publish(supersededPending, renderedContent("stale pending")))
            assertFalse(state.publish(rapidA, renderedContent("stale A")))
            assertFalse(state.publish(rapidB, renderedContent("stale B")))
            assertTrue(state.publish(rapidC, renderedContent("rapid C")))
            awaitCondition { renderedTexts == listOf("rapid C") }

            assertFalse(playbackStates.contains(Player.STATE_BUFFERING))
            assertEquals(0, mediaItemTransitions)
            assertEquals(0, timelineChanges)
            assertEquals(1, videoSource.createdPeriodCount)
            assertEquals(Player.STATE_READY, player.playbackState)
            assertEquals(5_000L, player.currentPosition)
            assertFalse(player.playWhenReady)
            assertEquals(audioBefore, selectedAudioSignature(player))
            assertEquals(internalTrackIdsBefore, player.internalTrackIds())
            assertEquals(1, player.dynamicAddonTrackCount())
            assertEquals("addon:rapid-c", state.snapshot().request?.trackId)
        } finally {
            state.setOnStreamRevisionChanged(null)
            player.release()
        }
    }

    private fun dynamicContent(value: String) = DynamicAddonSubtitleContent(
        mimeType = "application/x-subrip",
        samples = listOf(
            DynamicAddonSubtitleSample(
                timeUs = 1_000_000L,
                durationUs = 1_000_000L,
                data = value.encodeToByteArray(),
            ),
        ),
    )

    private fun dynamicFormat() = Format.Builder()
        .setId(DYNAMIC_ADDON_SUBTITLE_TRACK_ID)
        .setSampleMimeType("application/x-media3-cues")
        .setCueReplacementBehavior(Format.CUE_REPLACEMENT_BEHAVIOR_MERGE)
        .build()

    private fun renderedContent(value: String): DynamicAddonSubtitleContent =
        DynamicAddonSubtitleContent(
            mimeType = "application/x-subrip",
            samples = listOf(
                DynamicAddonSubtitleSample(
                    timeUs = 0L,
                    durationUs = 60_000_000L,
                    data = CueEncoder().encode(
                        listOf(Cue.Builder().setText(value).build()),
                        60_000_000L,
                    ),
                ),
            ),
        )

    private fun noOpParserFactory() = object : SubtitleParser.Factory {
        override fun supportsFormat(format: Format): Boolean = true

        override fun getCueReplacementBehavior(format: Format): Int =
            Format.CUE_REPLACEMENT_BEHAVIOR_MERGE

        override fun create(format: Format): SubtitleParser = object : SubtitleParser {
            override fun parse(
                data: ByteArray,
                offset: Int,
                length: Int,
                outputOptions: SubtitleParser.OutputOptions,
                output: androidx.media3.common.util.Consumer<androidx.media3.extractor.text.CuesWithTiming>,
            ) = Unit

            override fun getCueReplacementBehavior(): Int = Format.CUE_REPLACEMENT_BEHAVIOR_MERGE
        }
    }

    private fun internalSubtitleMediaSource(value: String): MediaSource {
        val format = Format.Builder()
            .setId("internal-subtitle")
            .setSampleMimeType(MimeTypes.APPLICATION_SUBRIP)
            .setRoleFlags(C.ROLE_FLAG_SUBTITLE)
            .build()
        val parserFactory = DefaultSubtitleParserFactory()
        val bytes = "1\n00:00:00,000 --> 00:01:00,000\n$value".encodeToByteArray()
        return ProgressiveMediaSource.Factory(
            DataSource.Factory { ByteArrayDataSource(bytes) },
            ExtractorsFactory {
                arrayOf(SubtitleExtractor(parserFactory.create(format), format))
            },
        ).createMediaSource(MediaItem.fromUri("memory://internal-subtitle"))
    }

    private class CountingMediaSource(mediaSource: MediaSource) : WrappingMediaSource(mediaSource) {
        var createdPeriodCount = 0
            private set

        override fun createPeriod(
            id: MediaSource.MediaPeriodId,
            allocator: Allocator,
            startPositionUs: Long,
        ): MediaPeriod {
            createdPeriodCount += 1
            return super.createPeriod(id, allocator, startPositionUs)
        }
    }

    private fun selectDynamicTrack(player: ExoPlayer) {
        val group = player.currentTracks.groups.first { tracksGroup ->
            tracksGroup.type == C.TRACK_TYPE_TEXT &&
                (0 until tracksGroup.length).any { index ->
                    matchesAddonSubtitleTrackId(
                        tracksGroup.getTrackFormat(index).id,
                        DYNAMIC_ADDON_SUBTITLE_TRACK_ID,
                    )
                }
        }
        player.trackSelectionParameters = player.trackSelectionParameters
            .buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
            .setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, listOf(0)))
            .build()
    }

    private fun selectAndPublishAddon(
        player: ExoPlayer,
        state: DynamicAddonSubtitleState,
        trackId: String,
        value: String,
    ) {
        val request = state.beginSelection(trackId, "https://subs.example/$trackId")
        selectDynamicTrack(player)
        assertTrue(state.publish(request, renderedContent(value)))
    }

    private fun selectInternalTrack(player: ExoPlayer) {
        val group = player.currentTracks.groups.first { tracksGroup ->
            tracksGroup.type == C.TRACK_TYPE_TEXT && !tracksGroup.isDynamicAddonSubtitleGroup()
        }
        player.trackSelectionParameters = player.trackSelectionParameters
            .buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
            .setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, listOf(0)))
            .build()
    }

    private fun disableTextTracks(player: ExoPlayer) {
        player.trackSelectionParameters = player.trackSelectionParameters
            .buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
            .clearOverridesOfType(C.TRACK_TYPE_TEXT)
            .build()
    }

    private fun selectedAudioSignature(player: ExoPlayer): String? =
        player.currentTracks.groups
            .firstOrNull { it.type == C.TRACK_TYPE_AUDIO && it.isSelected }
            ?.getTrackFormat(0)
            ?.let { format -> "${format.id}|${format.language}|${format.sampleMimeType}" }

    private fun ExoPlayer.dynamicTrackIsSelected(): Boolean =
        currentTracks.groups.any { group ->
            group.type == C.TRACK_TYPE_TEXT &&
                group.isSelected &&
                group.isDynamicAddonSubtitleGroup()
        }

    private fun ExoPlayer.internalTrackIsSelected(): Boolean =
        currentTracks.groups.any { group ->
            group.type == C.TRACK_TYPE_TEXT && group.isSelected && !group.isDynamicAddonSubtitleGroup()
        }

    private fun ExoPlayer.internalTrackIds(): List<String> =
        currentTracks.groups
            .filter { it.type == C.TRACK_TYPE_TEXT }
            .flatMap { group ->
                (0 until group.length).mapNotNull { index ->
                    group.getTrackFormat(index).id
                        ?.takeUnless(::isAddonSubtitleTrackId)
                        ?.let(::normalizeMedia3MergedTrackId)
                }
            }

    private fun ExoPlayer.dynamicAddonTrackCount(): Int =
        currentTracks.groups
            .filter { it.type == C.TRACK_TYPE_TEXT }
            .sumOf { group ->
                (0 until group.length).count { index ->
                    isAddonSubtitleTrackId(group.getTrackFormat(index).id)
                }
            }

    private fun androidx.media3.common.Tracks.Group.isDynamicAddonSubtitleGroup(): Boolean =
        (0 until length).any { index ->
            matchesAddonSubtitleTrackId(
                getTrackFormat(index).id,
                DYNAMIC_ADDON_SUBTITLE_TRACK_ID,
            )
        }

    private fun ExoPlayer.trackSummary(): String = currentTracks.groups.joinToString(", ") { group ->
        "type=${group.type}/selected=${group.isSelected}/" +
            (0 until group.length).joinToString("|") { index -> group.getTrackFormat(index).id.orEmpty() }
    }

    private fun awaitCondition(
        timeoutMs: Long = 5_000L,
        diagnostic: () -> String = { "" },
        condition: () -> Boolean,
    ) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (!condition() && System.currentTimeMillis() < deadline) {
            ShadowSystemClock.advanceBy(Duration.ofMillis(10L))
            shadowOf(Looper.getMainLooper()).idle()
            Thread.sleep(1L)
        }
        assertTrue(condition(), "Condition was not met within ${timeoutMs}ms: ${diagnostic()}")
    }
}
