package com.nuvio.app.features.library

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarToday
import androidx.compose.material.icons.rounded.ChevronLeft
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.nuvio.app.core.ui.NuvioScreen
import com.nuvio.app.core.ui.NuvioScreenHeader
import com.nuvio.app.features.details.MetaDetailsRepository
import com.nuvio.app.features.watchprogress.CurrentDateProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.library_calendar_empty_message
import nuvio.composeapp.generated.resources.library_calendar_empty_title
import nuvio.composeapp.generated.resources.library_calendar_title
import org.jetbrains.compose.resources.stringResource

data class LibraryCalendarEpisode(
    val date: SimpleCalendarDate,
    val showId: String,
    val showType: String,
    val showName: String,
    val title: String,
    val season: Int?,
    val episode: Int?,
    val imageUrls: List<String>,
)

@Composable
fun LibraryCalendarScreen(
    modifier: Modifier = Modifier,
    onBack: () -> Unit,
    onEpisodeClick: (LibraryCalendarEpisode) -> Unit,
) {
    val today = remember { SimpleCalendarDate.parse(CurrentDateProvider.todayIsoDate()) ?: SimpleCalendarDate(2026, 5, 17) }
    val uiState by remember {
        LibraryRepository.ensureLoaded()
        LibraryRepository.uiState
    }.collectAsStateWithLifecycle()
    val coroutineScope = rememberCoroutineScope()
    var visibleMonth by remember { mutableStateOf(SimpleCalendarMonth(today.year, today.month)) }
    var selectedDate by remember { mutableStateOf(today) }
    var isLoading by remember { mutableStateOf(false) }
    var episodes by remember { mutableStateOf<List<LibraryCalendarEpisode>>(emptyList()) }

    LaunchedEffect(uiState.items) {
        val series = uiState.items.filter { it.type.equals("series", ignoreCase = true) || it.type.equals("tv", ignoreCase = true) }
        if (series.isEmpty()) {
            episodes = emptyList()
            return@LaunchedEffect
        }
        isLoading = true
        episodes = withContext(Dispatchers.Default) {
            series.map { item ->
                async {
                    val details = MetaDetailsRepository.fetch(item.type, item.id)
                        ?: return@async emptyList()
                    details
                        .videos
                        .mapNotNull { video ->
                            val releaseDate = video.released?.substringBefore('T')?.let(SimpleCalendarDate::parse)
                                ?: return@mapNotNull null
                            if (releaseDate < today) return@mapNotNull null
                            LibraryCalendarEpisode(
                                date = releaseDate,
                                showId = item.id,
                                showType = item.type,
                                showName = item.name,
                                title = video.title,
                                season = video.season,
                                episode = video.episode,
                                imageUrls = listOfNotNull(
                                    video.thumbnail,
                                    details.background,
                                    details.poster,
                                    item.banner,
                                    item.poster,
                                )
                                    .map { it.trim() }
                                    .filter { it.isNotBlank() }
                                    .distinct(),
                            )
                        }
                }
            }.awaitAll().flatten().sortedWith(compareBy<LibraryCalendarEpisode> { it.date }.thenBy { it.showName })
        }
        isLoading = false
    }

    val episodeDates = remember(episodes) { episodes.map { it.date }.toSet() }
    val selectedEpisodes = remember(episodes, selectedDate) { episodes.filter { it.date == selectedDate } }

    NuvioScreen(
        modifier = modifier.fillMaxSize(),
        horizontalPadding = 0.dp,
    ) {
        stickyHeader {
            NuvioScreenHeader(
                title = stringResource(Res.string.library_calendar_title),
                onBack = onBack,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.background)
                    .padding(horizontal = 8.dp),
            )
        }

        item {
            MonthHeader(
                month = visibleMonth,
                onPrevious = { visibleMonth = visibleMonth.previous() },
                onNext = { visibleMonth = visibleMonth.next() },
            )
        }

        item {
            CalendarGrid(
                month = visibleMonth,
                today = today,
                selectedDate = selectedDate,
                episodeDates = episodeDates,
                onDateSelected = { selectedDate = it },
            )
        }

        if (isLoading) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 72.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }
        } else if (selectedEpisodes.isEmpty()) {
            item {
                CalendarEmptyState(modifier = Modifier.padding(top = 86.dp, start = 32.dp, end = 32.dp))
            }
        } else {
            items(
                items = selectedEpisodes,
                key = { episode -> "${episode.showId}:${episode.season}:${episode.episode}:${episode.date}" },
            ) { episode ->
                EpisodeReleaseRow(
                    episode = episode,
                    onClick = {
                        coroutineScope.launch {
                            onEpisodeClick(episode)
                        }
                    },
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                )
            }
        }
    }
}

@Composable
private fun MonthHeader(
    month: SimpleCalendarMonth,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp, bottom = 14.dp, start = 16.dp, end = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        IconButton(onClick = onPrevious) {
            Icon(
                imageVector = Icons.Rounded.ChevronLeft,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onBackground,
            )
        }
        Text(
            text = "${monthName(month.month)} ${month.year}",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
        )
        IconButton(onClick = onNext) {
            Icon(
                imageVector = Icons.Rounded.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onBackground,
            )
        }
    }
}

@Composable
private fun CalendarGrid(
    month: SimpleCalendarMonth,
    today: SimpleCalendarDate,
    selectedDate: SimpleCalendarDate,
    episodeDates: Set<SimpleCalendarDate>,
    onDateSelected: (SimpleCalendarDate) -> Unit,
) {
    Column(modifier = Modifier.padding(horizontal = 16.dp)) {
        Row(modifier = Modifier.fillMaxWidth()) {
            dayLabels().forEach { label ->
                Text(
                    text = label,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f),
                    textAlign = TextAlign.Center,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        Spacer(modifier = Modifier.height(14.dp))
        val firstDayOffset = dayOfWeek(month.year, month.month, 1)
        val daysInMonth = monthLength(month.year, month.month)
        repeat(6) { week ->
            Row(modifier = Modifier.fillMaxWidth()) {
                repeat(7) { day ->
                    val dayNumber = week * 7 + day - firstDayOffset + 1
                    val date = if (dayNumber in 1..daysInMonth) {
                        SimpleCalendarDate(month.year, month.month, dayNumber)
                    } else {
                        null
                    }
                    CalendarDayCell(
                        date = date,
                        selected = date == selectedDate,
                        isToday = date == today,
                        hasEpisode = date != null && date in episodeDates,
                        onClick = { date?.let(onDateSelected) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

@Composable
private fun CalendarDayCell(
    date: SimpleCalendarDate?,
    selected: Boolean,
    isToday: Boolean,
    hasEpisode: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.aspectRatio(1f),
        contentAlignment = Alignment.Center,
    ) {
        if (date == null) return@Box
        Surface(
            onClick = onClick,
            modifier = Modifier.size(38.dp),
            shape = CircleShape,
            color = when {
                selected -> MaterialTheme.colorScheme.primary.copy(alpha = 0.22f)
                else -> MaterialTheme.colorScheme.background
            },
            border = if (isToday) {
                androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primary)
            } else {
                null
            },
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    text = date.day.toString(),
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (selected || isToday) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onBackground
                    },
                    fontWeight = if (selected || isToday || hasEpisode) FontWeight.Bold else FontWeight.Medium,
                    textAlign = TextAlign.Center,
                )
                if (hasEpisode) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 4.dp)
                            .size(4.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primary),
                    )
                }
            }
        }
    }
}

@Composable
private fun CalendarEmptyState(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = Icons.Rounded.CalendarToday,
            contentDescription = null,
            modifier = Modifier.size(72.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
        )
        Spacer(modifier = Modifier.height(18.dp))
        Text(
            text = stringResource(Res.string.library_calendar_empty_title),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = stringResource(Res.string.library_calendar_empty_message),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun EpisodeReleaseRow(
    episode: LibraryCalendarEpisode,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var imageIndex by remember(episode.imageUrls) { mutableIntStateOf(0) }
    val imageUrl = episode.imageUrls.getOrNull(imageIndex)

    Surface(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.background,
        shape = MaterialTheme.shapes.extraSmall,
    ) {
        Row(
            modifier = Modifier.padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .width(104.dp)
                    .height(58.dp)
                    .clip(MaterialTheme.shapes.medium)
                    .background(MaterialTheme.colorScheme.surface),
            ) {
                if (!imageUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = imageUrl,
                        contentDescription = null,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                        onError = {
                            if (imageIndex < episode.imageUrls.lastIndex) {
                                imageIndex += 1
                            }
                        },
                    )
                }
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = episode.showName,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onBackground,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(3.dp))
                Text(
                    text = episode.codeAndTitle(),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Rounded.CalendarToday,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.72f),
                    )
                    Spacer(modifier = Modifier.width(5.dp))
                    Text(
                        text = episode.date.toDisplayLabel(),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

private fun LibraryCalendarEpisode.codeAndTitle(): String {
    val code = if (season != null && episode != null) "S${season}E${episode}" else null
    return listOfNotNull(code, title.takeIf { it.isNotBlank() }).joinToString(" - ")
}

private fun SimpleCalendarDate.toDisplayLabel(): String =
    "${shortMonthName(month)} $day, $year"

data class SimpleCalendarMonth(val year: Int, val month: Int) {
    fun previous(): SimpleCalendarMonth =
        if (month == 1) SimpleCalendarMonth(year - 1, 12) else SimpleCalendarMonth(year, month - 1)

    fun next(): SimpleCalendarMonth =
        if (month == 12) SimpleCalendarMonth(year + 1, 1) else SimpleCalendarMonth(year, month + 1)
}

data class SimpleCalendarDate(val year: Int, val month: Int, val day: Int) : Comparable<SimpleCalendarDate> {
    override fun compareTo(other: SimpleCalendarDate): Int =
        compareValuesBy(this, other, SimpleCalendarDate::year, SimpleCalendarDate::month, SimpleCalendarDate::day)

    override fun toString(): String =
        "${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}"

    companion object {
        fun parse(value: String): SimpleCalendarDate? {
            val parts = value.trim().split('-')
            if (parts.size != 3) return null
            val year = parts[0].toIntOrNull() ?: return null
            val month = parts[1].toIntOrNull() ?: return null
            val day = parts[2].toIntOrNull() ?: return null
            if (month !in 1..12 || day !in 1..monthLength(year, month)) return null
            return SimpleCalendarDate(year, month, day)
        }
    }
}

private fun dayLabels(): List<String> = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")

private fun monthName(month: Int): String =
    listOf(
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    )[month - 1]

private fun shortMonthName(month: Int): String =
    listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")[month - 1]

private fun monthLength(year: Int, month: Int): Int =
    when (month) {
        1, 3, 5, 7, 8, 10, 12 -> 31
        4, 6, 9, 11 -> 30
        2 -> if (isLeapYear(year)) 29 else 28
        else -> 30
    }

private fun isLeapYear(year: Int): Boolean =
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)

private fun dayOfWeek(year: Int, month: Int, day: Int): Int {
    val offsets = intArrayOf(0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4)
    val adjustedYear = if (month < 3) year - 1 else year
    return (adjustedYear + adjustedYear / 4 - adjustedYear / 100 + adjustedYear / 400 + offsets[month - 1] + day) % 7
}
