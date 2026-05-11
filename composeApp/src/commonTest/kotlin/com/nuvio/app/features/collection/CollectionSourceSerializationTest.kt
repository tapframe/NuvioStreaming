package com.nuvio.app.features.collection

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class CollectionSourceSerializationTest {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        prettyPrint = false
    }

    @Test
    fun traktSourceRoundTripsWithPublicListShape() {
        val collection = Collection(
            id = "collection-1",
            title = "Favorites",
            folders = listOf(
                CollectionFolder(
                    id = "folder-1",
                    title = "Lists",
                    sources = listOf(
                        CollectionSource(
                            provider = "trakt",
                            title = "Criterion Movies",
                            traktListId = 123456L,
                            mediaType = TmdbCollectionMediaType.MOVIE.name,
                            sortBy = TraktListSort.ADDED.value,
                            sortHow = TraktSortHow.DESC.value,
                        ),
                    ),
                ),
            ),
        )

        val encoded = json.encodeToString(listOf(collection))
        assertTrue(encoded.contains(""""provider":"trakt""""))
        assertTrue(encoded.contains(""""traktListId":123456"""))
        assertTrue(encoded.contains(""""sortHow":"desc""""))

        val decoded = json.decodeFromString<List<Collection>>(encoded)
        val source = decoded.single().folders.single().resolvedSources.single()
        assertTrue(source.isTrakt)
        assertEquals(123456L, source.traktListId)
        assertEquals(TmdbCollectionMediaType.MOVIE.name, source.mediaType)
        assertEquals(TraktListSort.ADDED.value, source.sortBy)
        assertEquals(TraktSortHow.DESC.value, source.sortHow)
    }

    @Test
    fun importedTraktSourceWithoutListIdIsRejected() {
        val payload = """
            [
              {
                "id": "collection-1",
                "title": "Favorites",
                "folders": [
                  {
                    "id": "folder-1",
                    "title": "Lists",
                    "sources": [
                      {
                        "provider": "trakt",
                        "title": "Missing List",
                        "mediaType": "MOVIE",
                        "sortBy": "rank",
                        "sortHow": "asc"
                      }
                    ]
                  }
                ]
              }
            ]
        """.trimIndent()

        val source = json.decodeFromString<List<Collection>>(payload)
            .single()
            .folders
            .single()
            .resolvedSources
            .single()

        assertTrue(source.hasInvalidTraktListId())
    }

    @Test
    fun legacyAddonCatalogSourcesRemainCompatible() {
        val payload = """
            [
              {
                "id": "collection-1",
                "title": "Favorites",
                "folders": [
                  {
                    "id": "folder-1",
                    "title": "Movies",
                    "catalogSources": [
                      {
                        "addonId": "addon-1",
                        "type": "movie",
                        "catalogId": "top",
                        "genre": "Action"
                      }
                    ]
                  }
                ]
              }
            ]
        """.trimIndent()

        val collection = json.decodeFromString<List<Collection>>(payload).single()
        val source = collection.folders.single().resolvedSources.single()
        val addonSource = source.addonCatalogSource()

        assertNotNull(addonSource)
        assertEquals("addon-1", addonSource.addonId)
        assertEquals("movie", addonSource.type)
        assertEquals("top", addonSource.catalogId)
        assertEquals("Action", addonSource.genre)
    }

    @Test
    fun sourceKeyPreservationKeepsUnknownTraktFields() {
        val raw = json.parseToJsonElement(
            """
                [
                  {
                    "id": "collection-1",
                    "title": "Favorites",
                    "folders": [
                      {
                        "id": "folder-1",
                        "title": "Lists",
                        "sources": [
                          {
                            "provider": "trakt",
                            "title": "Criterion Movies",
                            "traktListId": 123456,
                            "mediaType": "MOVIE",
                            "sortBy": "rank",
                            "sortHow": "asc",
                            "customField": "keep-me"
                          }
                        ]
                      }
                    ]
                  }
                ]
            """.trimIndent(),
        )
        val collection = Collection(
            id = "collection-1",
            title = "Favorites",
            folders = listOf(
                CollectionFolder(
                    id = "folder-1",
                    title = "Lists",
                    sources = listOf(
                        CollectionSource(
                            provider = "trakt",
                            title = "Criterion Movies",
                            traktListId = 123456L,
                            mediaType = TmdbCollectionMediaType.MOVIE.name,
                            sortBy = TraktListSort.RANK.value,
                            sortHow = TraktSortHow.ASC.value,
                        ),
                    ),
                ),
            ),
        )

        val merged = CollectionJsonPreserver.merge(json, raw, listOf(collection)).toString()
        assertTrue(merged.contains(""""customField":"keep-me""""))
        assertTrue(merged.contains(""""traktListId":123456"""))
    }

    @Test
    fun mobileGifToggleDoesNotEnterCollectionJsonOrOverwriteTvGifToggle() {
        val raw = json.parseToJsonElement(
            """
                [
                  {
                    "id": "collection-1",
                    "title": "Favorites",
                    "folders": [
                      {
                        "id": "folder-1",
                        "title": "Movies",
                        "coverImageUrl": "https://example.com/poster.jpg",
                        "focusGifUrl": "https://example.com/focus.gif",
                        "focusGifEnabled": true
                      }
                    ]
                  }
                ]
            """.trimIndent(),
        )
        val collection = json.decodeFromString<List<Collection>>(raw.toString()).single()
        val mobileDisabled = collection.copy(
            folders = collection.folders.map { folder ->
                folder.copy(mobileFocusGifEnabled = false)
            },
        )

        val merged = CollectionJsonPreserver.merge(json, raw, listOf(mobileDisabled))
        val mergedFolder = merged
            .single()
            .jsonObject["folders"]!!
            .jsonArray
            .single()
            .jsonObject

        assertTrue(mergedFolder["focusGifEnabled"]!!.jsonPrimitive.boolean)
        assertTrue(mergedFolder["mobileFocusGifEnabled"] == null)
    }

    @Test
    fun mobileGifToggleDefaultsIndependentOfTvGifToggle() {
        val payload = """
            [
              {
                "id": "collection-1",
                "title": "Favorites",
                "folders": [
                  {
                    "id": "folder-1",
                    "title": "Movies",
                    "focusGifUrl": "https://example.com/focus.gif",
                    "focusGifEnabled": false
                  }
                ]
              }
            ]
        """.trimIndent()

        val folder = json.decodeFromString<List<Collection>>(payload).single().folders.single()

        assertFalse(folder.focusGifEnabled)
        assertTrue(folder.mobileFocusGifEnabled)
    }
}
