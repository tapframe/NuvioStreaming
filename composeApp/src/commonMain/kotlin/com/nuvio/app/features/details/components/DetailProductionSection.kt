package com.nuvio.app.features.details.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.nuvio.app.features.details.MetaCompany
import com.nuvio.app.features.details.MetaDetails
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DetailProductionSection(
    meta: MetaDetails,
    modifier: Modifier = Modifier,
    showHeader: Boolean = true,
    onCompanyClick: ((MetaCompany, String) -> Unit)? = null,
) {
    val isSeriesLike = meta.type == "series" || meta.videos.any { it.season != null || it.episode != null }
    val isNetworkSource = isSeriesLike && meta.networks.isNotEmpty()
    val sourceItems = if (isSeriesLike) {
        meta.networks.ifEmpty { meta.productionCompanies }
    } else {
        meta.productionCompanies.ifEmpty { meta.networks }
    }
    if (sourceItems.isEmpty()) return

    val entityKind = if (isNetworkSource) "network" else "company"

    val displayItems = if (isSeriesLike) {
        sourceItems.take(6)
    } else {
        val logosOnly = sourceItems.filter { !it.logo.isNullOrBlank() }
        (if (logosOnly.isNotEmpty()) logosOnly else sourceItems).take(6)
    }
    if (displayItems.isEmpty()) return

    DetailSection(
        title = if (isSeriesLike) {
            stringResource(Res.string.details_networks)
        } else {
            stringResource(Res.string.meta_section_production_title)
        },
        modifier = modifier,
        showHeader = showHeader,
    ) {
        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val chipHeight = when {
                maxWidth >= 1024.dp -> 44.dp
                maxWidth >= 720.dp -> 40.dp
                else -> 36.dp
            }
            val logoWidth = when {
                maxWidth >= 1024.dp -> 72.dp
                maxWidth >= 720.dp -> 68.dp
                else -> 64.dp
            }
            val logoHeight = when {
                maxWidth >= 1024.dp -> 26.dp
                maxWidth >= 720.dp -> 24.dp
                else -> 22.dp
            }

            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                displayItems.forEach { item ->
                    ProductionChip(
                        item = item,
                        chipHeight = chipHeight,
                        logoWidth = logoWidth,
                        logoHeight = logoHeight,
                        onClick = if (onCompanyClick != null && item.tmdbId != null) {
                            { onCompanyClick(item, entityKind) }
                        } else null,
                    )
                }
            }
        }
    }
}

@Composable
private fun ProductionChip(
    item: MetaCompany,
    chipHeight: androidx.compose.ui.unit.Dp,
    logoWidth: androidx.compose.ui.unit.Dp,
    logoHeight: androidx.compose.ui.unit.Dp,
    onClick: (() -> Unit)? = null,
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(color = ProductionChipBackground)
            .then(
                if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier
            )
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .height(chipHeight),
        contentAlignment = Alignment.Center,
    ) {
        if (!item.logo.isNullOrBlank()) {
            AsyncImage(
                model = item.logo,
                contentDescription = item.name,
                modifier = Modifier
                    .width(logoWidth)
                    .height(logoHeight),
                contentScale = ContentScale.Fit,
            )
        } else {
            Text(
                text = item.name,
                style = MaterialTheme.typography.labelMedium.copy(
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                ),
                color = ProductionTextColor,
            )
        }
    }
}

private val ProductionChipBackground = androidx.compose.ui.graphics.Color(0xE6F5F5F5)
private val ProductionTextColor = androidx.compose.ui.graphics.Color(0xFF333333)
