package com.nuvio.app.features.player.sponsorblock

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Represents the categories of segments that SponsorBlock can identify.
 */
enum class SponsorBlockCategory(val apiValue: String, val displayLabel: String) {
    SPONSOR("sponsor", "Sponsor"),
    SELFPROMO("selfpromo", "Self-Promotion"),
    INTERACTION("interaction", "Interaction Reminder"),
    INTRO("intro", "Intermission/Intro"),
    OUTRO("outro", "Endcards/Credits"),
    PREVIEW("preview", "Preview/Recap"),
    MUSIC_OFFTOPIC("music_offtopic", "Non-Music in Music Videos"),
    FILLER("filler", "Filler"),
    ;

    companion object {
        /** Default categories that most users want to skip. */
        val DEFAULT_CATEGORIES = listOf(SPONSOR, SELFPROMO, INTERACTION, INTRO, OUTRO, PREVIEW)

        /** All available categories. */
        val ALL_CATEGORIES = entries.toList()

        fun fromApiValue(value: String): SponsorBlockCategory? =
            entries.firstOrNull { it.apiValue == value }
    }
}

/**
 * The action to take when a segment is reached.
 */
enum class SponsorBlockAction(val apiValue: String) {
    SKIP("skip"),
    MUTE("mute"),
    FULL("full"),
    POI("poi"),
    CHAPTER("chapter"),
    ;

    companion object {
        fun fromApiValue(value: String): SponsorBlockAction? =
            entries.firstOrNull { it.apiValue == value }
    }
}

/**
 * A single SponsorBlock segment as returned by the API.
 */
@Serializable
data class SponsorBlockSegment(
    @SerialName("segment") val segment: List<Double>,
    @SerialName("UUID") val uuid: String,
    @SerialName("category") val category: String,
    @SerialName("actionType") val actionType: String = "skip",
    @SerialName("locked") val locked: Int = 0,
    @SerialName("votes") val votes: Int = 0,
    @SerialName("videoDuration") val videoDuration: Double = 0.0,
    @SerialName("description") val description: String = "",
) {
    val startTime: Double get() = segment.getOrElse(0) { 0.0 }
    val endTime: Double get() = segment.getOrElse(1) { 0.0 }

    val categoryEnum: SponsorBlockCategory?
        get() = SponsorBlockCategory.fromApiValue(category)

    val actionEnum: SponsorBlockAction?
        get() = SponsorBlockAction.fromApiValue(actionType)
}

/**
 * Result from the hash-based privacy API endpoint.
 */
@Serializable
data class SponsorBlockHashResult(
    @SerialName("videoID") val videoId: String,
    @SerialName("segments") val segments: List<SponsorBlockSegment>,
)

/**
 * User-facing settings for SponsorBlock behavior.
 */
data class SponsorBlockSettings(
    val enabled: Boolean = false,
    val categories: Set<SponsorBlockCategory> = SponsorBlockCategory.DEFAULT_CATEGORIES.toSet(),
    val autoSkip: Boolean = true,
    val showSkipButton: Boolean = true,
    val showNotification: Boolean = true,
    val usePrivacyApi: Boolean = false,
)
