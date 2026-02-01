package com.nuvio.tv.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateIntOffsetAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.nuvio.tv.ui.theme.NuvioColors

data class SidebarItem(
    val route: String,
    val label: String,
    val icon: ImageVector
)

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SidebarNavigation(
    items: List<SidebarItem>,
    selectedRoute: String?,
    isExpanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    focusRequester: FocusRequester,
    onFocusChange: (Boolean) -> Unit,
    onNavigate: (String) -> Unit
) {
    val sidebarWidthPx = with(LocalDensity.current) { 260.dp.roundToPx() }
    val offsetX by animateIntOffsetAsState(
        targetValue = if (isExpanded) IntOffset.Zero else IntOffset(-sidebarWidthPx, 0),
        label = "sidebarOffset"
    )

    Column(
        modifier = Modifier
            .offset { offsetX }
            .width(260.dp)
            .fillMaxHeight()
            .background(NuvioColors.BackgroundElevated)
            .padding(vertical = 24.dp, horizontal = 16.dp)
            .onFocusChanged { state ->
                onFocusChange(state.hasFocus)
                onExpandedChange(state.hasFocus)
            },
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = "NUVIO",
            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
            color = NuvioColors.Primary
        )

        Spacer(modifier = Modifier.height(12.dp))

        items.forEach { item ->
            SidebarNavItem(
                item = item,
                isSelected = item.route == selectedRoute,
                focusRequester = if (item.route == selectedRoute) focusRequester else null,
                onNavigate = onNavigate
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun SidebarNavItem(
    item: SidebarItem,
    isSelected: Boolean,
    focusRequester: FocusRequester?,
    onNavigate: (String) -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(14.dp)
    val backgroundColor by animateColorAsState(
        targetValue = if (isFocused || isSelected) NuvioColors.FocusBackground else Color.Transparent,
        label = "navItemBackground"
    )
    val borderColor by animateColorAsState(
        targetValue = if (isFocused) NuvioColors.BorderFocused else Color.Transparent,
        label = "navItemBorder"
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .clip(shape)
            .background(backgroundColor)
            .border(width = 1.dp, color = borderColor, shape = shape)
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .onFocusChanged { state ->
                isFocused = state.isFocused
            }
            .clickable { onNavigate(item.route) }
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(NuvioColors.SurfaceVariant),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = item.icon,
                contentDescription = item.label,
                tint = NuvioColors.TextPrimary,
                modifier = Modifier.size(18.dp)
            )
        }

        Text(
            text = item.label,
            style = MaterialTheme.typography.titleMedium,
            color = if (isFocused || isSelected) NuvioColors.TextPrimary else NuvioColors.TextSecondary
        )
    }
}
