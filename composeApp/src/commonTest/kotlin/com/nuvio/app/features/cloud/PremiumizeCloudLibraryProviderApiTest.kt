package com.nuvio.app.features.cloud

import com.nuvio.app.features.debrid.DebridProviders
import com.nuvio.app.features.debrid.PremiumizeCloudFileDto
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PremiumizeCloudLibraryProviderApiTest {
    @Test
    fun `groups nested files by top-level folder and keeps root files standalone`() {
        val items = premiumizeCloudItemsFromFiles(
            files = listOf(
                PremiumizeCloudFileDto(
                    id = "e01",
                    name = "Show.S01E01.mkv",
                    path = "Show/Season 01/Show.S01E01.mkv",
                    size = 1_000,
                    mimeType = "video/x-matroska",
                    link = "https://pm/e01",
                ),
                PremiumizeCloudFileDto(
                    id = "e02",
                    name = "Show.S01E02.mkv",
                    path = "Show/Season 01/Show.S01E02.mkv",
                    size = 2_000,
                    mimeType = "video/x-matroska",
                    link = "https://pm/e02",
                ),
                PremiumizeCloudFileDto(
                    id = "movie",
                    name = "Movie.mp4",
                    path = "Movie.mp4",
                    size = 3_000,
                    mimeType = "video/mp4",
                    link = "https://pm/movie",
                ),
            ),
            providerId = DebridProviders.PREMIUMIZE_ID,
            providerName = "Premiumize",
        )

        assertEquals(listOf("Movie.mp4", "Show"), items.map { it.name })
        assertEquals(CloudLibraryItemType.File, items.first().type)
        assertEquals(listOf("Show.S01E01.mkv", "Show.S01E02.mkv"), items[1].files.map { it.name })
        assertEquals("https://pm/e01", items[1].files.first().playbackUrl)
    }

    @Test
    fun `marks non video and missing fields as non playable without dropping valid files`() {
        val items = premiumizeCloudItemsFromFiles(
            files = listOf(
                PremiumizeCloudFileDto(id = "notes", name = "notes.txt", path = "Pack/notes.txt", size = 100),
                PremiumizeCloudFileDto(id = "video", name = "video.avi", path = "Pack/video.avi", size = 200),
                PremiumizeCloudFileDto(id = "missing", name = null, path = null, size = 300),
            ),
            providerId = DebridProviders.PREMIUMIZE_ID,
            providerName = "Premiumize",
        )

        assertEquals(1, items.size)
        assertEquals(2, items.single().files.size)
        assertFalse(items.single().files.first { it.name == "notes.txt" }.playable)
        assertTrue(items.single().files.first { it.name == "video.avi" }.playable)
    }
}
