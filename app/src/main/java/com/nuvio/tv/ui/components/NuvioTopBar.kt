package com.nuvio.tv.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.nuvio.tv.ui.theme.NuvioColors

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun NuvioTopBar(
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(80.dp)
            .background(NuvioColors.Background)
            .padding(horizontal = 48.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "NUVIO",
            style = MaterialTheme.typography.headlineLarge.copy(
                fontWeight = FontWeight.Bold
            ),
            color = NuvioColors.Primary
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(32.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TopBarNavItem(text = "Home", isSelected = true)
            TopBarNavItem(text = "Movies", isSelected = false)
            TopBarNavItem(text = "Series", isSelected = false)
            TopBarNavItem(text = "Search", isSelected = false)
            TopBarNavItem(text = "Settings", isSelected = false)
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun TopBarNavItem(
    text: String,
    isSelected: Boolean,
    modifier: Modifier = Modifier
) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        color = if (isSelected) NuvioColors.Primary else NuvioColors.TextSecondary,
        modifier = modifier
    )
}
