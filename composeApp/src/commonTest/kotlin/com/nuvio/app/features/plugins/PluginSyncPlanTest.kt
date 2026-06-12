package com.nuvio.app.features.plugins

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PluginSyncPlanTest {

    private fun repo(
        manifestUrl: String,
        name: String = "Repo",
        serverUrl: String? = null,
        serverRepoType: String? = null,
        serverEnabled: Boolean? = null,
    ) = PluginRepositoryItem(
        manifestUrl = manifestUrl,
        name = name,
        serverUrl = serverUrl,
        serverRepoType = serverRepoType,
        serverEnabled = serverEnabled,
    )

    @Test
    fun pushEntriesPreserveOriginalServerUrlAndRepoType() {
        val cloudStreamRepo = repo(
            manifestUrl = "https://example.com/cs/repo.json/manifest.json",
            name = "CS Repo",
            serverUrl = "https://example.com/cs/repo.json",
            serverRepoType = "CLOUDSTREAM",
            serverEnabled = false,
        )

        val entries = buildPluginPushEntries(listOf(cloudStreamRepo))

        assertEquals(1, entries.size)
        assertEquals("https://example.com/cs/repo.json", entries[0].url)
        assertEquals("CLOUDSTREAM", entries[0].repoType)
        assertEquals(false, entries[0].enabled)
        assertEquals(0, entries[0].sortOrder)
    }

    @Test
    fun pushEntriesFallBackToManifestUrlForLocallyAddedRepos() {
        val localRepo = repo(
            manifestUrl = "https://example.com/nuvio/manifest.json",
            name = "Local Repo",
        )

        val entries = buildPluginPushEntries(listOf(localRepo))

        assertEquals("https://example.com/nuvio/manifest.json", entries[0].url)
        assertNull(entries[0].repoType)
        assertTrue(entries[0].enabled)
    }

    @Test
    fun pushEntriesIgnoreBlankServerMetadata() {
        val blankMetadataRepo = repo(
            manifestUrl = "https://example.com/nuvio/manifest.json",
            serverUrl = " ",
            serverRepoType = "",
        )

        val entries = buildPluginPushEntries(listOf(blankMetadataRepo))

        assertEquals("https://example.com/nuvio/manifest.json", entries[0].url)
        assertNull(entries[0].repoType)
    }

    @Test
    fun pushEntriesAssignSortOrderByPosition() {
        val entries = buildPluginPushEntries(
            listOf(
                repo(manifestUrl = "https://a.example/manifest.json"),
                repo(manifestUrl = "https://b.example/manifest.json"),
            ),
        )

        assertEquals(listOf(0, 1), entries.map { it.sortOrder })
    }

    @Test
    fun preservesLocalWhenRemoteEmptyAndLocalHasRepositories() {
        assertTrue(
            shouldPreserveLocalPluginRepositories(
                remoteUrls = emptyList(),
                localRepositories = listOf(repo(manifestUrl = "https://a.example/manifest.json")),
            ),
        )
    }

    @Test
    fun doesNotPreserveLocalWhenRemoteHasRepositories() {
        assertFalse(
            shouldPreserveLocalPluginRepositories(
                remoteUrls = listOf("https://a.example/manifest.json"),
                localRepositories = listOf(repo(manifestUrl = "https://b.example/manifest.json")),
            ),
        )
    }

    @Test
    fun doesNotPreserveLocalWhenLocalIsEmpty() {
        assertFalse(
            shouldPreserveLocalPluginRepositories(
                remoteUrls = emptyList(),
                localRepositories = emptyList(),
            ),
        )
    }
}
