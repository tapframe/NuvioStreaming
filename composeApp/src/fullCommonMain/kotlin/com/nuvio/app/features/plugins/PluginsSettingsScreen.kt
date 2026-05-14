package com.nuvio.app.features.plugins

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Extension
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import com.nuvio.app.core.ui.NuvioIconActionButton
import com.nuvio.app.core.ui.NuvioInfoBadge
import com.nuvio.app.core.ui.NuvioInputField
import com.nuvio.app.core.ui.NuvioPrimaryButton
import com.nuvio.app.core.ui.NuvioSectionLabel
import com.nuvio.app.core.ui.NuvioSurfaceCard
import com.nuvio.app.features.tmdb.TmdbSettingsRepository
import kotlinx.coroutines.launch

@Composable
fun PluginsSettingsPageContent(
    modifier: Modifier = Modifier,
) {
    LaunchedEffect(Unit) {
        PluginRepository.initialize()
    }

    val uiState by PluginRepository.uiState.collectAsStateWithLifecycle()
    val tmdbSettings by remember {
        TmdbSettingsRepository.ensureLoaded()
        TmdbSettingsRepository.uiState
    }.collectAsStateWithLifecycle()
    val coroutineScope = rememberCoroutineScope()

    var repositoryUrl by rememberSaveable { mutableStateOf("") }
    var message by rememberSaveable { mutableStateOf<String?>(null) }
    var isAdding by remember { mutableStateOf(false) }

    var testingScraperId by remember { mutableStateOf<String?>(null) }
    val testResults = remember { mutableStateMapOf<String, List<PluginRuntimeResult>>() }

    var configuringRepo by remember { mutableStateOf<PluginRepositoryItem?>(null) }

    val sortedRepos = remember(uiState.repositories) {
        uiState.repositories.sortedBy { it.name.lowercase() }
    }
    val hasTmdbApiKey = tmdbSettings.hasApiKey
    val repositoryNameByUrl = remember(sortedRepos) {
        sortedRepos.associate { it.manifestUrl to it.name }
    }
    val sortedScrapers = remember(uiState.scrapers, repositoryNameByUrl) {
        uiState.scrapers.sortedWith(
            compareBy<PluginScraper>(
                { repositoryNameByUrl[it.repositoryUrl]?.lowercase() ?: it.repositoryUrl.lowercase() },
                { it.name.lowercase() },
            ),
        )
    }

    configuringRepo?.let { repo ->
        PluginConfigDialog(
            repo = repo,
            onDismiss = { configuringRepo = null },
            onSave = { values ->
                PluginStorage.saveConfig(repo.manifestUrl, values)
                configuringRepo = null
            },
        )
    }

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        NuvioSectionLabel("OVERVIEW")
        NuvioSurfaceCard {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                NuvioInfoBadge(text = "${sortedRepos.size} repos")
                NuvioInfoBadge(text = "${sortedScrapers.size} providers")
                NuvioInfoBadge(
                    text = if (uiState.pluginsEnabled) "Plugins enabled" else "Plugins disabled",
                )
                NuvioInfoBadge(
                    text = if (hasTmdbApiKey) "TMDB API key set" else "TMDB API key missing",
                )
            }
            if (!hasTmdbApiKey) {
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Plugin providers require a TMDB API key. Set it on the TMDB screen or plugin providers will not work correctly.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Enable plugin providers globally",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "Use plugin providers during stream discovery.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Switch(
                    checked = uiState.pluginsEnabled,
                    onCheckedChange = { PluginRepository.setPluginsEnabled(it) },
                )
            }

            Spacer(modifier = Modifier.height(12.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Group plugin providers by repository",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "In Streams, show one provider per repository instead of one per source.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Switch(
                    checked = uiState.groupStreamsByRepository,
                    onCheckedChange = { PluginRepository.setGroupStreamsByRepository(it) },
                )
            }
        }

        NuvioSectionLabel("ADD REPOSITORY")
        NuvioSurfaceCard {
            NuvioInputField(
                value = repositoryUrl,
                onValueChange = {
                    repositoryUrl = it
                    message = null
                },
                placeholder = "Plugin manifest URL",
            )
            Spacer(modifier = Modifier.height(16.dp))
            NuvioPrimaryButton(
                text = if (isAdding) "Installing..." else "Install Plugin Repository",
                enabled = repositoryUrl.isNotBlank() && !isAdding,
                onClick = {
                    val requested = repositoryUrl.trim()
                    if (requested.isBlank()) {
                        message = "Enter a plugin repository URL."
                        return@NuvioPrimaryButton
                    }
                    isAdding = true
                    message = null
                    coroutineScope.launch {
                        when (val result = PluginRepository.addRepository(requested)) {
                            is AddPluginRepositoryResult.Success -> {
                                repositoryUrl = ""
                                message = "Installed ${result.repository.name}."
                            }
                            is AddPluginRepositoryResult.Error -> {
                                message = result.message
                            }
                        }
                        isAdding = false
                    }
                },
            )
            message?.let { text ->
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = text,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        NuvioSectionLabel("INSTALLED REPOSITORIES")
        if (sortedRepos.isEmpty()) {
            NuvioSurfaceCard {
                Text(
                    text = "No plugin repositories installed yet.",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Add a repository URL to install provider plugins for stream discovery.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            sortedRepos.forEach { repo ->
                NuvioSurfaceCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Top,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = repo.name,
                                style = MaterialTheme.typography.headlineLarge,
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                            repo.version?.let { version ->
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(
                                    text = "Version $version",
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = repo.manifestUrl,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (repo.settings.isNotEmpty()) {
                                NuvioIconActionButton(
                                    icon = Icons.Rounded.Settings,
                                    contentDescription = "Configure plugin repository",
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    onClick = { configuringRepo = repo },
                                )
                            }
                            NuvioIconActionButton(
                                icon = Icons.Rounded.Refresh,
                                contentDescription = "Refresh plugin repository",
                                tint = MaterialTheme.colorScheme.primary,
                                onClick = { PluginRepository.refreshRepository(repo.manifestUrl, pushAfterRefresh = true) },
                            )
                            NuvioIconActionButton(
                                icon = Icons.Rounded.Delete,
                                contentDescription = "Delete plugin repository",
                                tint = MaterialTheme.colorScheme.error,
                                onClick = { PluginRepository.removeRepository(repo.manifestUrl) },
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(14.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        NuvioInfoBadge(text = "${repo.scraperCount} providers")
                        if (repo.settings.isNotEmpty()) {
                            NuvioInfoBadge(text = "Configurable")
                        }
                        if (repo.isRefreshing) {
                            NuvioInfoBadge(text = "Refreshing")
                        }
                    }
                    repo.errorMessage?.let { errorMessage ->
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = errorMessage,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }
        }

        NuvioSectionLabel("PROVIDERS")
        if (sortedScrapers.isEmpty()) {
            NuvioSurfaceCard {
                Text(
                    text = "No providers available yet.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            sortedScrapers.forEach { scraper ->
                val scraperResults = testResults[scraper.id]
                val isTestingThisScraper = testingScraperId == scraper.id
                val repositoryName = repositoryNameByUrl[scraper.repositoryUrl]
                    ?: scraper.repositoryUrl.fallbackRepositoryLabel()

                NuvioSurfaceCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Top,
                    ) {
                        Row(
                            modifier = Modifier.weight(1f),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Extension,
                                contentDescription = null,
                                tint = if (scraper.enabled) Color(0xFF68B76A) else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = repositoryName,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.primary,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = scraper.name,
                                    style = MaterialTheme.typography.titleLarge,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = scraper.description.ifBlank { "No description" },
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                        Switch(
                            checked = scraper.enabled,
                            onCheckedChange = { PluginRepository.toggleScraper(scraper.id, it) },
                            enabled = scraper.manifestEnabled,
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        NuvioInfoBadge(text = scraper.supportedTypes.joinToString(" | "))
                        NuvioInfoBadge(text = "v${scraper.version}")
                        if (!scraper.manifestEnabled) {
                            NuvioInfoBadge(text = "Disabled by repo")
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    NuvioPrimaryButton(
                        text = if (isTestingThisScraper) "Testing..." else "Test Provider",
                        enabled = hasTmdbApiKey && !isTestingThisScraper,
                        onClick = {
                            testingScraperId = scraper.id
                            coroutineScope.launch {
                                PluginRepository.testScraper(scraper.id)
                                    .onSuccess { results ->
                                        testResults[scraper.id] = results
                                    }
                                    .onFailure { error ->
                                        testResults[scraper.id] = listOf(
                                            PluginRuntimeResult(
                                                title = "Error",
                                                name = error.message ?: "Provider test failed",
                                                url = "about:error",
                                            ),
                                        )
                                    }
                                testingScraperId = null
                            }
                        },
                    )

                    if (!scraperResults.isNullOrEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = "Test results (${scraperResults.size})",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        scraperResults.take(8).forEach { result ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.Top,
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Bolt,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = result.title,
                                        style = MaterialTheme.typography.bodyLarge,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        text = result.url,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(6.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PluginConfigDialog(
    repo: PluginRepositoryItem,
    onDismiss: () -> Unit,
    onSave: (Map<String, String>) -> Unit,
) {
    val savedValues = remember(repo.manifestUrl) {
        PluginStorage.loadConfig(repo.manifestUrl)
    }
    val fieldValues = remember(repo.manifestUrl) {
        mutableStateMapOf<String, String>().apply {
            repo.settings.forEach { field ->
                put(field.key, savedValues[field.key] ?: field.default.orEmpty())
            }
        }
    }
    val passwordVisibility = remember(repo.manifestUrl) {
        mutableStateMapOf<String, Boolean>().apply {
            repo.settings.forEach { field -> put(field.key, false) }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "${repo.name} — Settings",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
        },
        text = {
            val scrollState = rememberScrollState()
            Column(
                modifier = Modifier.verticalScroll(scrollState),    
                verticalArrangement = Arrangement.spacedBy(16.dp)) {
                repo.settings.forEach { field ->
                    val isPassword = field.type == "password"
                    val isVisible = passwordVisibility[field.key] == true
                    Column {
                        Text(
                            text = field.label,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        field.description?.let { desc ->
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = desc,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        NuvioInputField(
                            value = fieldValues[field.key].orEmpty(),
                            onValueChange = { fieldValues[field.key] = it },
                            placeholder = field.label,
                            trailingContent = if (isPassword) {
                                {
                                    IconButton(onClick = {
                                        passwordVisibility[field.key] = !isVisible
                                    }) {
                                        Icon(
                                            imageVector = if (isVisible) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                                            contentDescription = if (isVisible) "Hide" else "Show",
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            } else null,
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(fieldValues.toMap()) }) {
                Text(
                    text = "Save",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(
                    text = "Cancel",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        containerColor = MaterialTheme.colorScheme.surface,
    )
}

private fun String.fallbackRepositoryLabel(): String {
    val withoutQuery = substringBefore("?")
    val withoutManifest = withoutQuery.removeSuffix("/manifest.json")
    val host = withoutManifest.substringAfter("://", withoutManifest).substringBefore('/')
    return host.ifBlank {
        withoutManifest.substringAfterLast('/').ifBlank { "Plugin repository" }
    }
}