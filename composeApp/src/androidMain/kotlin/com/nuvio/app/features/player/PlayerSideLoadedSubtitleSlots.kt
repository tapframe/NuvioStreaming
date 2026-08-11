package com.nuvio.app.features.player

import androidx.annotation.OptIn
import androidx.media3.common.Format
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.Consumer
import androidx.media3.common.util.UnstableApi
import androidx.media3.extractor.text.CuesWithTiming
import androidx.media3.extractor.text.SubtitleParser
import java.nio.charset.Charset
import java.nio.charset.StandardCharsets

internal const val ADDON_SUBTITLE_SLOT_COUNT = 16
internal const val AUTO_DETECT_SUBTITLE_MIME_TYPE = "application/x-nuvio-subtitle-auto"
private const val ADDON_SUBTITLE_SLOT_URI_PREFIX = "nuvio-addon-subtitle-slot:"
private const val SUBTITLE_DETECTION_BYTE_LIMIT = 64 * 1024

internal data class AddonSubtitleSlot(
    val index: Int,
) {
    val trackId: String = "${ADDON_SUBTITLE_TRACK_ID_PREFIX}slot:$index"
    val uri: String = "$ADDON_SUBTITLE_SLOT_URI_PREFIX$index"
}

/**
 * Assigns each visited addon subtitle to one immutable side-loaded Media3 track slot.
 *
 * A slot is never reassigned because its progressive subtitle source can retain parsed samples
 * after deselection. Keeping the mapping immutable makes A -> B -> A reuse deterministic.
 */
internal class AddonSubtitleSlotRegistry(
    slotCount: Int = ADDON_SUBTITLE_SLOT_COUNT,
) {
    private val slots = List(slotCount.coerceAtLeast(0), ::AddonSubtitleSlot)
    private val slotByIdentity = mutableMapOf<String, AddonSubtitleSlot>()
    private val slotByUrl = mutableMapOf<String, AddonSubtitleSlot>()
    private val urlBySlotUri = mutableMapOf<String, String>()

    @Synchronized
    fun bind(subtitle: AddonSubtitle): AddonSubtitleSlot? =
        bind(identity = buildAddonSubtitleTrackId(subtitle), url = subtitle.url)

    @Synchronized
    fun bind(url: String): AddonSubtitleSlot? =
        bind(identity = buildAddonSubtitleTrackId(url), url = url)

    @Synchronized
    fun resolveUrl(slotUri: String): String? = urlBySlotUri[slotUri]

    @Synchronized
    fun clear() {
        slotByIdentity.clear()
        slotByUrl.clear()
        urlBySlotUri.clear()
    }

    private fun bind(identity: String, url: String): AddonSubtitleSlot? {
        slotByIdentity[identity]?.let { return it }
        slotByUrl[url]?.let { existing ->
            slotByIdentity[identity] = existing
            return existing
        }

        val slot = slots.firstOrNull { it.uri !in urlBySlotUri } ?: return null
        slotByIdentity[identity] = slot
        slotByUrl[url] = slot
        urlBySlotUri[slot.uri] = url
        return slot
    }
}

internal fun addonSubtitleSlotConfigurations(): List<androidx.media3.common.MediaItem.SubtitleConfiguration> =
    List(ADDON_SUBTITLE_SLOT_COUNT) { index ->
        val slot = AddonSubtitleSlot(index)
        androidx.media3.common.MediaItem.SubtitleConfiguration.Builder(android.net.Uri.parse(slot.uri))
            .setId(slot.trackId)
            .setMimeType(AUTO_DETECT_SUBTITLE_MIME_TYPE)
            .setRoleFlags(androidx.media3.common.C.ROLE_FLAG_SUBTITLE)
            .build()
    }

@OptIn(UnstableApi::class)
internal class AutoDetectingSubtitleParserFactory(
    private val delegate: SubtitleParser.Factory,
    private val onFormatDetected: (trackId: String?, mimeType: String) -> Unit = { _, _ -> },
) : SubtitleParser.Factory {

    override fun supportsFormat(format: Format): Boolean =
        format.sampleMimeType == AUTO_DETECT_SUBTITLE_MIME_TYPE || delegate.supportsFormat(format)

    override fun getCueReplacementBehavior(format: Format): Int =
        if (format.sampleMimeType == AUTO_DETECT_SUBTITLE_MIME_TYPE) {
            Format.CUE_REPLACEMENT_BEHAVIOR_MERGE
        } else {
            delegate.getCueReplacementBehavior(format)
        }

    override fun create(format: Format): SubtitleParser =
        if (format.sampleMimeType == AUTO_DETECT_SUBTITLE_MIME_TYPE) {
            AutoDetectingSubtitleParser(format, delegate, onFormatDetected)
        } else {
            delegate.create(format)
        }
}

@OptIn(UnstableApi::class)
private class AutoDetectingSubtitleParser(
    private val sourceFormat: Format,
    private val delegateFactory: SubtitleParser.Factory,
    private val onFormatDetected: (trackId: String?, mimeType: String) -> Unit,
) : SubtitleParser {
    private var delegate: SubtitleParser? = null

    override fun getCueReplacementBehavior(): Int = Format.CUE_REPLACEMENT_BEHAVIOR_MERGE

    override fun parse(
        data: ByteArray,
        offset: Int,
        length: Int,
        outputOptions: SubtitleParser.OutputOptions,
        output: Consumer<CuesWithTiming>,
    ) {
        val parser = delegate ?: run {
            val mimeType = detectSideLoadedSubtitleMimeType(data, offset, length)
            delegateFactory.create(
                sourceFormat.buildUpon()
                    .setSampleMimeType(mimeType)
                    .build(),
            ).also {
                delegate = it
                onFormatDetected(sourceFormat.id, mimeType)
            }
        }
        parser.parse(data, offset, length, outputOptions, output)
    }

    override fun reset() {
        delegate?.reset()
        delegate = null
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
