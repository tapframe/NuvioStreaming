package com.nuvio.app.features.parentsguide

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

class ParentsGuideRepositoryTest {
    private val response = """
        {"success":true,"data":{"identity":{"mediaType":"movie","title":"Test fixture","imdbId":"tt1234567"},"guide":{"id":"guide-1","overallStatus":"partial","contentVersion":1,"categories":[{"category":"profanity","severity":"severe","scenes":[{"description":"Test scene","startSeconds":862,"spoilerLevel":"major","verificationStatus":"moderator_verified"}]},{"category":"sex_nudity","severity":"none","scenes":[]}],"sources":[{"sourceType":"moderator_entry","sourceName":"Test fixture"}]}}}
    """.trimIndent()

    @Test
    fun `json serialization preserves status timestamps and provenance`() {
        val parsed = Json { ignoreUnknownKeys = true }.decodeFromString<ParentsGuideEnvelope>(response)
        assertEquals(ParentsGuideStatus.PARTIAL, parsed.data.guide.overallStatus)
        assertEquals(862, parsed.data.guide.categories[0].scenes[0].startSeconds)
        assertEquals("Test fixture", parsed.data.guide.sources[0].sourceName)
    }

    @Test
    fun `repository returns partial success and then a cache hit`() = runBlocking {
        var calls = 0
        val client = ParentsGuideClient(
            ParentsGuideRemoteDataSource("https://example.test") { calls += 1; 200 to response },
            ParentsGuideCache { 1_000L },
        )
        val request = ParentsGuideRequest("movie", imdbId = "tt1234567")
        val first = assertIs<ParentsGuideUiState.Available>(client.load(request))
        assertEquals(ParentsGuideStatus.PARTIAL, first.data.guide.overallStatus)
        assertEquals(false, first.fromCache)
        assertEquals(true, assertIs<ParentsGuideUiState.Available>(client.load(request)).fromCache)
        assertEquals(1, calls)
    }

    @Test
    fun `cache expires and refreshes`() = runBlocking {
        var now = 0L
        var calls = 0
        val client = ParentsGuideClient(
            ParentsGuideRemoteDataSource("https://example.test") { calls += 1; 200 to response },
            ParentsGuideCache { now },
        )
        val request = ParentsGuideRequest("movie", imdbId = "tt1234567")
        client.load(request)
        now = 24 * 60 * 60 * 1_000L + 1
        client.load(request)
        assertEquals(2, calls)
    }

    @Test
    fun `network error is isolated from details screen`() = runBlocking {
        val client = ParentsGuideClient(
            ParentsGuideRemoteDataSource("https://example.test") { 503 to "" },
            ParentsGuideCache { 0L },
        )
        assertIs<ParentsGuideUiState.Error>(client.load(ParentsGuideRequest("movie", imdbId = "tt1234567")))
        Unit
    }

    @Test
    fun `identifier resolution supports imdb tmdb and episode shapes`() {
        val imdb = resolveParentsGuideRequest("series", "tt1234567:2:4")!!
        assertEquals("tt1234567", imdb.imdbId)
        assertEquals(2, imdb.season)
        assertEquals(4, imdb.episode)
        assertEquals(42, resolveParentsGuideRequest("movie", "tmdb:42")?.tmdbId)
        assertNull(resolveParentsGuideRequest("movie", ""))
    }

    @Test
    fun `categories order and severity remain canonical`() {
        val parsed = Json { ignoreUnknownKeys = true }.decodeFromString<ParentsGuideEnvelope>(response)
        val ordered = orderedCategories(parsed.data.guide.categories)
        assertEquals(listOf(ParentsGuideCategoryType.SEX_NUDITY, ParentsGuideCategoryType.PROFANITY), ordered.map { it.category })
        assertEquals(ParentsGuideSeverity.SEVERE, parsed.data.guide.categories.first().severity)
    }

    @Test
    fun `spoiler hiding only keeps non spoiler scenes`() {
        val scenes = listOf(
            ParentsGuideScene("Safe", spoilerLevel = ParentsGuideSpoilerLevel.NONE),
            ParentsGuideScene("Hidden", spoilerLevel = ParentsGuideSpoilerLevel.MAJOR),
        )
        assertEquals(listOf("Safe"), visibleScenes(scenes, showSpoilers = false).map { it.description })
        assertEquals(2, visibleScenes(scenes, showSpoilers = true).size)
    }

    @Test
    fun `timestamp formatting supports long runtimes`() {
        assertEquals("14:22", formatGuideTimestamp(862))
        assertEquals("01:14:22", formatGuideTimestamp(4462))
    }
}
