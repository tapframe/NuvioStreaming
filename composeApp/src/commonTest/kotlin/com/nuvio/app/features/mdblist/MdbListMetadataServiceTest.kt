package com.nuvio.app.features.mdblist

import com.nuvio.app.features.details.MetaDetails
import kotlin.test.Test
import kotlin.test.assertTrue

class MdbListMetadataServiceTest {

    @Test
    fun `addon imdb alias enables ratings for anime id`() {
        val meta = MetaDetails(
            id = "mal:49894",
            type = "series",
            name = "Hero Classroom",
            imdbId = "tt28254942",
        )

        assertTrue(
            MdbListMetadataService.shouldFetchForMeta(
                meta = meta,
                fallbackItemId = meta.id,
                settings = MdbListSettings(
                    enabled = true,
                    apiKey = "test",
                ),
            ),
        )
    }
}
