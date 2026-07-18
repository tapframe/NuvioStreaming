package com.nuvio.app.features.player

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.nuvio.app.core.ui.PlatformBackHandler

@Composable
internal fun PlayerOverlayScaffold(
    visible: Boolean,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    overlayTint: Color = Color.Black.copy(alpha = 0.34f),
    contentPadding: PaddingValues = PaddingValues(),
    content: @Composable BoxScope.() -> Unit,
) {
    PlatformBackHandler(enabled = visible, onBack = onDismiss)

    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(250)),
        exit = fadeOut(tween(200)),
        modifier = modifier,
    ) {
        val interactionSource = remember { MutableInteractionSource() }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .clickable(
                    interactionSource = interactionSource,
                    indication = null,
                    onClick = onDismiss,
                ),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .drawWithCache {
                        val horizontalGradient = Brush.horizontalGradient(
                            listOf(Color.Black.copy(alpha = 0.88f), Color.Transparent),
                        )
                        val verticalGradient = Brush.verticalGradient(
                            colorStops = arrayOf(
                                0f to Color.Black.copy(alpha = 0.6f),
                                0.3f to Color.Black.copy(alpha = 0.4f),
                                0.6f to Color.Black.copy(alpha = 0.2f),
                                1f to Color.Transparent,
                            ),
                        )
                        onDrawBehind {
                            drawRect(horizontalGradient)
                            if (overlayTint.alpha > 0f) drawRect(overlayTint)
                            drawRect(verticalGradient)
                        }
                    }
                    .padding(contentPadding),
                content = content,
            )
        }
    }
}
