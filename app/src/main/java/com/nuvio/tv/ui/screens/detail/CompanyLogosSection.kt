@file:OptIn(androidx.tv.material3.ExperimentalTvMaterial3Api::class)

package com.nuvio.tv.ui.screens.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.nuvio.tv.domain.model.MetaCompany
import com.nuvio.tv.ui.components.FadeInAsyncImage
import com.nuvio.tv.ui.theme.NuvioColors
import com.nuvio.tv.ui.theme.NuvioTheme

@Composable
fun CompanyLogosSection(
    title: String,
    companies: List<MetaCompany>
) {
    if (companies.isEmpty()) return

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 20.dp, bottom = 8.dp)
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            color = NuvioColors.TextPrimary,
            modifier = Modifier.padding(horizontal = 48.dp)
        )

        TvLazyRow(
            modifier = Modifier.fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 48.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(companies, key = { it.name }) { company ->
                CompanyLogoCard(company = company)
            }
        }
    }
}

@Composable
private fun CompanyLogoCard(company: MetaCompany) {
    Box(
        modifier = Modifier
            .width(140.dp)
            .height(56.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White),
        contentAlignment = Alignment.Center
    ) {
        if (company.logo != null) {
            FadeInAsyncImage(
                model = company.logo,
                contentDescription = company.name,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                contentScale = ContentScale.Fit
            )
        } else {
            Text(
                text = company.name,
                style = MaterialTheme.typography.labelLarge,
                color = NuvioTheme.extendedColors.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 16.dp)
            )
        }
    }
}
