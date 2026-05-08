package com.nuvio.app.features.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material3.BasicAlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.nuvio.app.core.ui.NuvioScreen
import com.nuvio.app.core.ui.NuvioScreenHeader
import com.nuvio.app.core.ui.NuvioSurfaceCard
import com.nuvio.app.features.addons.httpRequestRaw
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString
import org.jetbrains.compose.resources.stringResource

private enum class CommunityTab {
    Contributors,
    Supporters,
}

private data class CommunityUiState(
    val selectedTab: CommunityTab = CommunityTab.Contributors,
    val isContributorsLoading: Boolean = false,
    val hasLoadedContributors: Boolean = false,
    val contributors: List<CommunityContributor> = emptyList(),
    val contributorsErrorMessage: String? = null,
    val isSupportersLoading: Boolean = false,
    val hasLoadedSupporters: Boolean = false,
    val supporters: List<SupporterDonation> = emptyList(),
    val supportersErrorMessage: String? = null,
)

@Serializable
private data class ContributionsResponseDto(
    val contributors: List<ContributionDto> = emptyList(),
)

@Serializable
private data class ContributionDto(
    val name: String? = null,
    val avatar: String? = null,
    val profile: String? = null,
    val total: Int? = null,
)

@Serializable
private data class DonationsResponseDto(
    val donations: List<DonationDto> = emptyList(),
)

@Serializable
private data class DonationDto(
    val name: String? = null,
    val date: String? = null,
    val message: String? = null,
)

internal data class CommunityContributor(
    val login: String,
    val avatarUrl: String?,
    val profileUrl: String?,
    val totalContributions: Int,
)

internal data class SupporterDonation(
    val key: String,
    val name: String,
    val date: String,
    val message: String?,
    val sortTimestamp: Long,
)

private object SupportersContributorsRepository {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    suspend fun getContributors(): Result<List<CommunityContributor>> = runCatching {
        val contributionsUrl = CommunityConfig.CONTRIBUTIONS_URL.trim()
        check(contributionsUrl.isNotBlank()) {
            getString(Res.string.community_error_unable_load_contributors)
        }

        val response = httpRequestRaw(
            method = "GET",
            url = contributionsUrl,
            headers = emptyMap(),
            body = "",
        )
        if (response.status !in 200..299) {
            error(getString(Res.string.community_error_contributors_request_failed))
        }

        json.decodeFromString<ContributionsResponseDto>(response.body)
            .contributors
            .mapNotNull(::normalizeContributor)
            .sortedWith(
                compareByDescending<CommunityContributor> { it.totalContributions }
                    .thenBy { it.login.lowercase() },
            )
    }

    suspend fun getSupporters(limit: Int = 200): Result<List<SupporterDonation>> = runCatching {
        val baseUrl = CommunityConfig.DONATIONS_BASE_URL.trim().removeSuffix("/")
        check(baseUrl.isNotBlank()) {
            getString(Res.string.community_supporters_not_configured)
        }

        val response = httpRequestRaw(
            method = "GET",
            url = "$baseUrl/api/donations?limit=$limit",
            headers = emptyMap(),
            body = "",
        )
        if (response.status !in 200..299) {
            error(getString(Res.string.community_error_supporters_request_failed))
        }

        json.decodeFromString<DonationsResponseDto>(response.body)
            .donations
            .mapNotNull { donation ->
                val name = donation.name?.trim().orEmpty()
                val date = donation.date?.trim().orEmpty()
                if (name.isBlank() || date.isBlank()) return@mapNotNull null

                SupporterDonation(
                    key = "${name.lowercase()}-$date",
                    name = name,
                    date = date,
                    message = donation.message?.trim()?.takeIf { it.isNotBlank() },
                    sortTimestamp = supporterSortTimestamp(date),
                )
            }
            .sortedByDescending { it.sortTimestamp }
            .mapIndexed { index, donation ->
                donation.copy(key = "${donation.key}#$index")
            }
    }

    private fun normalizeContributor(dto: ContributionDto): CommunityContributor? {
        val login = dto.name?.trim().orEmpty()
        val contributions = dto.total ?: 0
        if (login.isBlank() || contributions <= 0) return null

        return CommunityContributor(
            login = login,
            avatarUrl = dto.avatar?.trim()?.takeIf { it.isNotBlank() },
            profileUrl = dto.profile?.trim()?.takeIf { it.isNotBlank() },
            totalContributions = contributions,
        )
    }

    private fun supporterSortTimestamp(rawDate: String): Long {
        val datePart = rawDate.substringBefore('T')
        val parts = datePart.split('-')
        if (parts.size != 3) return Long.MIN_VALUE
        val year = parts[0].toLongOrNull() ?: return Long.MIN_VALUE
        val month = parts[1].toLongOrNull() ?: return Long.MIN_VALUE
        val day = parts[2].toLongOrNull() ?: return Long.MIN_VALUE
        return year * 10_000L + month * 100L + day
    }
}

@Composable
fun SupportersContributorsSettingsScreen(
    onBack: () -> Unit,
) {
    NuvioScreen(
        modifier = Modifier.fillMaxSize(),
    ) {
        stickyHeader {
            NuvioScreenHeader(
                title = stringResource(Res.string.compose_settings_page_supporters_contributors),
                onBack = onBack,
            )
        }
        supportersContributorsContent(isTablet = false)
    }
}

internal fun LazyListScope.supportersContributorsContent(
    isTablet: Boolean,
) {
    item {
        SupportersContributorsBody(isTablet = isTablet)
    }
}

@Composable
private fun SupportersContributorsBody(
    isTablet: Boolean,
) {
    val uriHandler = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    val donateUrl = remember { CommunityConfig.DONATIONS_DONATE_URL.trim().removeSuffix("/") }
    val donationsConfigured = remember { CommunityConfig.DONATIONS_BASE_URL.trim().isNotBlank() }
    val donateConfigured = donateUrl.isNotBlank()
    val contributorsErrorFallback = stringResource(Res.string.community_error_unable_load_contributors)
    val supportersErrorFallback = stringResource(Res.string.community_error_unable_load_supporters)

    var uiState by remember { mutableStateOf(CommunityUiState()) }
    var selectedContributor by remember { mutableStateOf<CommunityContributor?>(null) }
    var selectedSupporter by remember { mutableStateOf<SupporterDonation?>(null) }

    fun loadContributors(force: Boolean) {
        if (uiState.isContributorsLoading) return
        if (!force && uiState.hasLoadedContributors) return
        scope.launch {
            uiState = uiState.copy(
                isContributorsLoading = true,
                contributorsErrorMessage = null,
            )
            SupportersContributorsRepository.getContributors()
                .onSuccess { contributors ->
                    uiState = uiState.copy(
                        isContributorsLoading = false,
                        hasLoadedContributors = true,
                        contributors = contributors,
                        contributorsErrorMessage = null,
                    )
                }
                .onFailure { error ->
                    uiState = uiState.copy(
                        isContributorsLoading = false,
                        hasLoadedContributors = false,
                        contributors = emptyList(),
                        contributorsErrorMessage = error.message ?: contributorsErrorFallback,
                    )
                }
        }
    }

    fun loadSupporters(force: Boolean) {
        if (uiState.isSupportersLoading) return
        if (!force && uiState.hasLoadedSupporters) return
        scope.launch {
            uiState = uiState.copy(
                isSupportersLoading = true,
                supportersErrorMessage = null,
            )
            SupportersContributorsRepository.getSupporters()
                .onSuccess { supporters ->
                    uiState = uiState.copy(
                        isSupportersLoading = false,
                        hasLoadedSupporters = true,
                        supporters = supporters,
                        supportersErrorMessage = null,
                    )
                }
                .onFailure { error ->
                    uiState = uiState.copy(
                        isSupportersLoading = false,
                        hasLoadedSupporters = false,
                        supporters = emptyList(),
                        supportersErrorMessage = error.message ?: supportersErrorFallback,
                    )
                }
        }
    }

    LaunchedEffect(Unit) {
        loadContributors(force = false)
    }

    LaunchedEffect(uiState.selectedTab) {
        if (uiState.selectedTab == CommunityTab.Supporters) {
            loadSupporters(force = false)
        }
    }

    Column(
        verticalArrangement = Arrangement.spacedBy(if (isTablet) 18.dp else 14.dp),
    ) {
        NuvioSurfaceCard {
            Text(
                text = stringResource(Res.string.community_section_title),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = stringResource(Res.string.community_section_description),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = { if (donateConfigured) uriHandler.openUri(donateUrl) },
                enabled = donateConfigured,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Favorite,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(modifier = Modifier.size(8.dp))
                Text(stringResource(Res.string.action_donate))
            }
            if (!donationsConfigured) {
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = stringResource(Res.string.community_supporters_not_configured),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }

        NuvioSurfaceCard {
            CommunityTabRow(
                selectedTab = uiState.selectedTab,
                onSelectTab = { tab -> uiState = uiState.copy(selectedTab = tab) },
            )
        }

        when (uiState.selectedTab) {
            CommunityTab.Contributors -> ContributorsCard(
                contributors = uiState.contributors,
                isLoading = uiState.isContributorsLoading,
                errorMessage = uiState.contributorsErrorMessage,
                onRetry = { loadContributors(force = true) },
                onContributorClick = { selectedContributor = it },
            )

            CommunityTab.Supporters -> SupportersCard(
                supporters = uiState.supporters,
                isLoading = uiState.isSupportersLoading,
                errorMessage = uiState.supportersErrorMessage,
                onRetry = { loadSupporters(force = true) },
                onSupporterClick = { selectedSupporter = it },
            )
        }
    }

    selectedContributor?.let { contributor ->
        val supportUrl = contributorSupportLink(contributor.login)
        val contributionSummary = contributorContributionSummary(contributor)
        CommunityDetailsDialog(
            title = contributor.login,
            subtitle = contributionSummary,
            onDismiss = { selectedContributor = null },
            primaryActionLabel = if (contributor.profileUrl != null) {
                stringResource(Res.string.community_open_github)
            } else {
                null
            },
            onPrimaryAction = contributor.profileUrl?.let { url -> { uriHandler.openUri(url) } },
            secondaryActionLabel = if (supportUrl != null) stringResource(Res.string.action_donate) else null,
            onSecondaryAction = supportUrl?.let { url -> { uriHandler.openUri(url) } },
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                CommunityAvatar(
                    label = contributor.login,
                    imageUrl = contributor.avatarUrl,
                    modifier = Modifier.size(72.dp),
                )
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = contributionSummary,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = contributor.profileUrl ?: stringResource(Res.string.community_github_profile_unavailable),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }

    selectedSupporter?.let { supporter ->
        CommunityDetailsDialog(
            title = supporter.name,
            subtitle = formatDonationDate(supporter.date),
            onDismiss = { selectedSupporter = null },
            primaryActionLabel = null,
            onPrimaryAction = null,
            secondaryActionLabel = null,
            onSecondaryAction = null,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                NameAvatar(
                    label = supporter.name,
                    modifier = Modifier.size(72.dp),
                )
                Text(
                    text = supporter.message ?: stringResource(Res.string.community_no_message_attached),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun CommunityTabRow(
    selectedTab: CommunityTab,
    onSelectTab: (CommunityTab) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        CommunityTab.entries.forEach { tab ->
            val isSelected = tab == selectedTab
            Surface(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(999.dp))
                    .clickable { onSelectTab(tab) },
                color = if (isSelected) {
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
                } else {
                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
                },
                shape = RoundedCornerShape(999.dp),
            ) {
                Box(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = if (tab == CommunityTab.Contributors) {
                            stringResource(Res.string.community_tab_contributors)
                        } else {
                            stringResource(Res.string.community_tab_supporters)
                        },
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
                    )
                }
            }
        }
    }
}

@Composable
private fun ContributorsCard(
    contributors: List<CommunityContributor>,
    isLoading: Boolean,
    errorMessage: String?,
    onRetry: () -> Unit,
    onContributorClick: (CommunityContributor) -> Unit,
) {
    NuvioSurfaceCard {
        when {
            isLoading -> LoadingState(label = stringResource(Res.string.community_loading_contributors))
            errorMessage != null -> ErrorState(
                title = stringResource(Res.string.community_load_contributors_failed),
                message = errorMessage,
                onRetry = onRetry,
            )
            contributors.isEmpty() -> EmptyState(label = stringResource(Res.string.community_empty_contributors))
            else -> LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 480.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                contentPadding = PaddingValues(vertical = 2.dp),
            ) {
                items(
                    items = contributors,
                    key = { contributor -> "${contributor.login.lowercase()}-${contributor.profileUrl.orEmpty()}" },
                ) { contributor ->
                    ContributorRow(
                        contributor = contributor,
                        onClick = { onContributorClick(contributor) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SupportersCard(
    supporters: List<SupporterDonation>,
    isLoading: Boolean,
    errorMessage: String?,
    onRetry: () -> Unit,
    onSupporterClick: (SupporterDonation) -> Unit,
) {
    NuvioSurfaceCard {
        when {
            isLoading -> LoadingState(label = stringResource(Res.string.community_loading_supporters))
            errorMessage != null -> ErrorState(
                title = stringResource(Res.string.community_load_supporters_failed),
                message = errorMessage,
                onRetry = onRetry,
            )
            supporters.isEmpty() -> EmptyState(label = stringResource(Res.string.community_empty_supporters))
            else -> LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 480.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                contentPadding = PaddingValues(vertical = 2.dp),
            ) {
                items(
                    items = supporters,
                    key = { supporter -> supporter.key },
                ) { supporter ->
                    SupporterRow(
                        supporter = supporter,
                        onClick = { onSupporterClick(supporter) },
                    )
                }
            }
        }
    }
}

@Composable
private fun ContributorRow(
    contributor: CommunityContributor,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        CommunityAvatar(
            label = contributor.login,
            imageUrl = contributor.avatarUrl,
            modifier = Modifier.size(54.dp),
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = contributor.login,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = contributorContributionSummary(contributor),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Icon(
            imageVector = Icons.AutoMirrored.Rounded.OpenInNew,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SupporterRow(
    supporter: SupporterDonation,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        NameAvatar(
            label = supporter.name,
            modifier = Modifier.size(54.dp),
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = supporter.name,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = formatDonationDate(supporter.date),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            supporter.message?.let { message ->
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Icon(
            imageVector = Icons.AutoMirrored.Rounded.OpenInNew,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun CommunityAvatar(
    label: String,
    imageUrl: String?,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        if (imageUrl.isNullOrBlank()) {
            Text(
                text = label.take(1).uppercase(),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
            )
        } else {
            AsyncImage(
                model = imageUrl,
                contentDescription = label,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        }
    }
}

@Composable
private fun NameAvatar(
    label: String,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "?",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun LoadingState(
    label: String,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        CircularProgressIndicator(strokeWidth = 2.dp)
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun EmptyState(
    label: String,
) {
    Text(
        text = label,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 24.dp),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
    )
}

@Composable
private fun ErrorState(
    title: String,
    message: String,
    onRetry: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
        )
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Button(onClick = onRetry) {
            Text(stringResource(Res.string.action_retry))
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
private fun CommunityDetailsDialog(
    title: String,
    subtitle: String,
    onDismiss: () -> Unit,
    primaryActionLabel: String?,
    onPrimaryAction: (() -> Unit)?,
    secondaryActionLabel: String?,
    onSecondaryAction: (() -> Unit)?,
    content: @Composable () -> Unit,
) {
    BasicAlertDialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(24.dp),
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                content()

                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (primaryActionLabel != null && onPrimaryAction != null) {
                        Button(onClick = onPrimaryAction) {
                            Text(primaryActionLabel)
                        }
                    }
                    if (secondaryActionLabel != null && onSecondaryAction != null) {
                        Button(onClick = onSecondaryAction) {
                            Text(secondaryActionLabel)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun contributorContributionSummary(contributor: CommunityContributor): String =
    stringResource(Res.string.community_total_commits, contributor.totalContributions)

private fun contributorSupportLink(login: String): String? = when (login.lowercase()) {
    "skoruppa" -> "https://ko-fi.com/skoruppa"
    "crisszollo", "xrissozollo" -> "https://ko-fi.com/crisszollo"
    else -> null
}

@Composable
private fun formatDonationDate(rawDate: String): String {
    val datePart = rawDate.substringBefore('T')
    val parts = datePart.split('-')
    if (parts.size != 3) return rawDate
    val year = parts[0]
    val month = parts[1].toIntOrNull()?.let { monthIndex ->
        listOf(
            stringResource(Res.string.community_month_jan),
            stringResource(Res.string.community_month_feb),
            stringResource(Res.string.community_month_mar),
            stringResource(Res.string.community_month_apr),
            stringResource(Res.string.community_month_may),
            stringResource(Res.string.community_month_jun),
            stringResource(Res.string.community_month_jul),
            stringResource(Res.string.community_month_aug),
            stringResource(Res.string.community_month_sep),
            stringResource(Res.string.community_month_oct),
            stringResource(Res.string.community_month_nov),
            stringResource(Res.string.community_month_dec),
        ).getOrNull(monthIndex - 1)
    } ?: return rawDate
    val day = parts[2].toIntOrNull()?.toString() ?: return rawDate
    return stringResource(Res.string.community_date_format, month, day, year)
}
