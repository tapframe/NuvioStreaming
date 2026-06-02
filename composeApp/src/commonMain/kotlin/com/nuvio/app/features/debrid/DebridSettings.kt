package com.nuvio.app.features.debrid

import kotlinx.serialization.Serializable

data class DebridSettings(
    val enabled: Boolean = false,
    val cloudLibraryEnabled: Boolean = true,
    val providerApiKeys: Map<String, String> = emptyMap(),
    val preferredResolverProviderId: String = "",
    val instantPlaybackPreparationLimit: Int = 0,
    val streamMaxResults: Int = 0,
    val streamSortMode: DebridStreamSortMode = DebridStreamSortMode.DEFAULT,
    val streamMinimumQuality: DebridStreamMinimumQuality = DebridStreamMinimumQuality.ANY,
    val streamDolbyVisionFilter: DebridStreamFeatureFilter = DebridStreamFeatureFilter.ANY,
    val streamHdrFilter: DebridStreamFeatureFilter = DebridStreamFeatureFilter.ANY,
    val streamCodecFilter: DebridStreamCodecFilter = DebridStreamCodecFilter.ANY,
    val streamPreferences: DebridStreamPreferences = DebridStreamPreferences(),
    val streamNameTemplate: String = DebridStreamFormatterDefaults.NAME_TEMPLATE,
    val streamDescriptionTemplate: String = DebridStreamFormatterDefaults.DESCRIPTION_TEMPLATE,
) {
    val torboxApiKey: String
        get() = apiKeyFor(DebridProviders.TORBOX_ID)

    val realDebridApiKey: String
        get() = apiKeyFor(DebridProviders.REAL_DEBRID_ID)

    val premiumizeApiKey: String
        get() = apiKeyFor(DebridProviders.PREMIUMIZE_ID)

    val hasAnyApiKey: Boolean
        get() = DebridProviders.configuredServices(this).isNotEmpty()

    val resolverServices: List<DebridServiceCredential>
        get() = DebridProviders.configuredResolverServices(this)

    val activeResolverCredential: DebridServiceCredential?
        get() = DebridProviders.preferredResolverService(this)

    val activeResolverProviderId: String?
        get() = activeResolverCredential?.provider?.id

    val hasResolverProvider: Boolean
        get() = activeResolverCredential != null

    val linkResolvingEnabled: Boolean
        get() = enabled

    val canResolvePlayableLinks: Boolean
        get() = linkResolvingEnabled && hasResolverProvider

    val hasCloudLibraryProvider: Boolean
        get() = DebridProviders.configuredServices(this)
            .any { credential -> credential.provider.supports(DebridProviderCapability.CloudLibrary) }

    val canUseCloudLibrary: Boolean
        get() = cloudLibraryEnabled && hasCloudLibraryProvider

    val hasCustomStreamFormatting: Boolean
        get() = DebridStreamFormatterDefaults.NAME_TEMPLATE.isNotBlank() ||
            DebridStreamFormatterDefaults.DESCRIPTION_TEMPLATE.isNotBlank() ||
            streamNameTemplate.isNotBlank() ||
            streamDescriptionTemplate.isNotBlank()

    fun apiKeyFor(providerId: String?): String {
        val normalized = DebridProviders.byId(providerId)?.id
            ?: providerId?.trim()?.lowercase()
            ?: return ""
        return providerApiKeys[normalized].orEmpty()
    }
}

const val DEBRID_PREPARE_INSTANT_PLAYBACK_DEFAULT_LIMIT = 2
const val DEBRID_PREPARE_INSTANT_PLAYBACK_MAX_LIMIT = 5

enum class DebridStreamSortMode {
    DEFAULT,
    QUALITY_DESC,
    SIZE_DESC,
    SIZE_ASC,
}

enum class DebridStreamMinimumQuality(val minResolution: Int) {
    ANY(0),
    P720(720),
    P1080(1080),
    P2160(2160),
}

enum class DebridStreamFeatureFilter {
    ANY,
    EXCLUDE,
    ONLY,
}

enum class DebridStreamCodecFilter {
    ANY,
    H264,
    HEVC,
    AV1,
}

@Serializable
data class DebridStreamPreferences(
    val maxResults: Int = 0,
    val maxPerResolution: Int = 0,
    val maxPerQuality: Int = 0,
    val sizeMinGb: Int = 0,
    val sizeMaxGb: Int = 0,
    val preferredResolutions: List<DebridStreamResolution> = DebridStreamResolution.defaultOrder,
    val requiredResolutions: List<DebridStreamResolution> = emptyList(),
    val excludedResolutions: List<DebridStreamResolution> = emptyList(),
    val preferredQualities: List<DebridStreamQuality> = DebridStreamQuality.defaultOrder,
    val requiredQualities: List<DebridStreamQuality> = emptyList(),
    val excludedQualities: List<DebridStreamQuality> = emptyList(),
    val preferredVisualTags: List<DebridStreamVisualTag> = DebridStreamVisualTag.defaultOrder,
    val requiredVisualTags: List<DebridStreamVisualTag> = emptyList(),
    val excludedVisualTags: List<DebridStreamVisualTag> = emptyList(),
    val preferredAudioTags: List<DebridStreamAudioTag> = DebridStreamAudioTag.defaultOrder,
    val requiredAudioTags: List<DebridStreamAudioTag> = emptyList(),
    val excludedAudioTags: List<DebridStreamAudioTag> = emptyList(),
    val preferredAudioChannels: List<DebridStreamAudioChannel> = DebridStreamAudioChannel.defaultOrder,
    val requiredAudioChannels: List<DebridStreamAudioChannel> = emptyList(),
    val excludedAudioChannels: List<DebridStreamAudioChannel> = emptyList(),
    val preferredEncodes: List<DebridStreamEncode> = DebridStreamEncode.defaultOrder,
    val requiredEncodes: List<DebridStreamEncode> = emptyList(),
    val excludedEncodes: List<DebridStreamEncode> = emptyList(),
    val preferredLanguages: List<DebridStreamLanguage> = emptyList(),
    val requiredLanguages: List<DebridStreamLanguage> = emptyList(),
    val excludedLanguages: List<DebridStreamLanguage> = emptyList(),
    val requiredReleaseGroups: List<String> = emptyList(),
    val excludedReleaseGroups: List<String> = emptyList(),
    val sortCriteria: List<DebridStreamSortCriterion> = DebridStreamSortCriterion.originalOrder,
)

@Serializable
enum class DebridStreamResolution(val label: String, val value: Int) {
    P2160("2160p", 2160),
    P1440("1440p", 1440),
    P1080("1080p", 1080),
    P720("720p", 720),
    P576("576p", 576),
    P480("480p", 480),
    P360("360p", 360),
    UNKNOWN("Unknown", 0);

    companion object {
        val defaultOrder = listOf(P2160, P1440, P1080, P720, P576, P480, P360, UNKNOWN)
    }
}

@Serializable
enum class DebridStreamQuality(val label: String) {
    BLURAY_REMUX("BluRay REMUX"),
    BLURAY("BluRay"),
    WEB_DL("WEB-DL"),
    WEBRIP("WEBRip"),
    HDRIP("HDRip"),
    HD_RIP("HC HD-Rip"),
    DVDRIP("DVDRip"),
    HDTV("HDTV"),
    CAM("CAM"),
    TS("TS"),
    TC("TC"),
    SCR("SCR"),
    UNKNOWN("Unknown");

    companion object {
        val defaultOrder = listOf(BLURAY_REMUX, BLURAY, WEB_DL, WEBRIP, HDRIP, HD_RIP, DVDRIP, HDTV, CAM, TS, TC, SCR, UNKNOWN)
    }
}

@Serializable
enum class DebridStreamVisualTag(val label: String) {
    HDR_DV("HDR+DV"),
    DV_ONLY("DV Only"),
    HDR_ONLY("HDR Only"),
    HDR10_PLUS("HDR10+"),
    HDR10("HDR10"),
    DV("DV"),
    HDR("HDR"),
    HLG("HLG"),
    TEN_BIT("10bit"),
    THREE_D("3D"),
    IMAX("IMAX"),
    AI("AI"),
    SDR("SDR"),
    H_OU("H-OU"),
    H_SBS("H-SBS"),
    UNKNOWN("Unknown");

    companion object {
        val defaultOrder = listOf(HDR_DV, DV_ONLY, HDR_ONLY, HDR10_PLUS, HDR10, DV, HDR, HLG, TEN_BIT, IMAX, SDR, THREE_D, AI, H_OU, H_SBS, UNKNOWN)
    }
}

@Serializable
enum class DebridStreamAudioTag(val label: String) {
    ATMOS("Atmos"),
    DD_PLUS("DD+"),
    DD("DD"),
    DTS_X("DTS:X"),
    DTS_HD_MA("DTS-HD MA"),
    DTS_HD("DTS-HD"),
    DTS_ES("DTS-ES"),
    DTS("DTS"),
    TRUEHD("TrueHD"),
    OPUS("OPUS"),
    FLAC("FLAC"),
    AAC("AAC"),
    UNKNOWN("Unknown");

    companion object {
        val defaultOrder = listOf(ATMOS, DD_PLUS, DD, DTS_X, DTS_HD_MA, DTS_HD, DTS_ES, DTS, TRUEHD, OPUS, FLAC, AAC, UNKNOWN)
    }
}

@Serializable
enum class DebridStreamAudioChannel(val label: String) {
    CH_2_0("2.0"),
    CH_5_1("5.1"),
    CH_6_1("6.1"),
    CH_7_1("7.1"),
    UNKNOWN("Unknown");

    companion object {
        val defaultOrder = listOf(CH_7_1, CH_6_1, CH_5_1, CH_2_0, UNKNOWN)
    }
}

@Serializable
enum class DebridStreamEncode(val label: String) {
    AV1("AV1"),
    HEVC("HEVC"),
    AVC("AVC"),
    XVID("XviD"),
    DIVX("DivX"),
    UNKNOWN("Unknown");

    companion object {
        val defaultOrder = listOf(AV1, HEVC, AVC, XVID, DIVX, UNKNOWN)
    }
}

@Serializable
enum class DebridStreamLanguage(val code: String, val label: String) {
    EN("en", "English"),
    HI("hi", "Hindi"),
    IT("it", "Italian"),
    ES("es", "Spanish"),
    FR("fr", "French"),
    DE("de", "German"),
    PT("pt", "Portuguese"),
    PL("pl", "Polish"),
    CS("cs", "Czech"),
    LA("la", "Latino"),
    JA("ja", "Japanese"),
    KO("ko", "Korean"),
    ZH("zh", "Chinese"),
    MULTI("multi", "Multi"),
    UNKNOWN("unknown", "Unknown"),
}

@Serializable
data class DebridStreamSortCriterion(
    val key: DebridStreamSortKey = DebridStreamSortKey.RESOLUTION,
    val direction: DebridStreamSortDirection = DebridStreamSortDirection.DESC,
) {
    companion object {
        val originalOrder = emptyList<DebridStreamSortCriterion>()
        val defaultOrder = listOf(
            DebridStreamSortCriterion(DebridStreamSortKey.RESOLUTION, DebridStreamSortDirection.DESC),
            DebridStreamSortCriterion(DebridStreamSortKey.QUALITY, DebridStreamSortDirection.DESC),
            DebridStreamSortCriterion(DebridStreamSortKey.VISUAL_TAG, DebridStreamSortDirection.DESC),
            DebridStreamSortCriterion(DebridStreamSortKey.AUDIO_TAG, DebridStreamSortDirection.DESC),
            DebridStreamSortCriterion(DebridStreamSortKey.AUDIO_CHANNEL, DebridStreamSortDirection.DESC),
            DebridStreamSortCriterion(DebridStreamSortKey.ENCODE, DebridStreamSortDirection.DESC),
            DebridStreamSortCriterion(DebridStreamSortKey.SIZE, DebridStreamSortDirection.DESC),
        )
    }
}

@Serializable
enum class DebridStreamSortKey(val label: String) {
    RESOLUTION("Resolution"),
    QUALITY("Quality"),
    VISUAL_TAG("Visual tag"),
    AUDIO_TAG("Audio"),
    AUDIO_CHANNEL("Audio channel"),
    ENCODE("Encode"),
    SIZE("Size"),
    LANGUAGE("Language"),
    RELEASE_GROUP("Release group"),
}

@Serializable
enum class DebridStreamSortDirection {
    ASC,
    DESC,
}

fun normalizeDebridInstantPlaybackPreparationLimit(value: Int): Int =
    value.coerceIn(0, DEBRID_PREPARE_INSTANT_PLAYBACK_MAX_LIMIT)

fun normalizeDebridStreamMaxResults(value: Int): Int =
    if (value <= 0) 0 else value.coerceIn(1, 100)
