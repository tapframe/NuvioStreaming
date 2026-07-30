package com.nuvio.app.features.plugins

internal data class PluginPushEntry(
    val url: String,
    val name: String,
    val enabled: Boolean,
    val repoType: String?,
    val sortOrder: Int,
)

internal fun buildPluginPushEntries(repositories: List<PluginRepositoryItem>): List<PluginPushEntry> =
    repositories.mapIndexed { index, repo ->
        PluginPushEntry(
            url = repo.serverUrl?.takeIf { it.isNotBlank() } ?: repo.manifestUrl,
            name = repo.name,
            enabled = repo.serverEnabled ?: true,
            repoType = repo.serverRepoType?.takeIf { it.isNotBlank() },
            sortOrder = index,
        )
    }

internal fun shouldPreserveLocalPluginRepositories(
    remoteUrls: List<String>,
    localRepositories: List<PluginRepositoryItem>,
): Boolean = remoteUrls.isEmpty() && localRepositories.isNotEmpty()
