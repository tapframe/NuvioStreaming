package com.nuvio.app.features.player

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.text.StaticLayout
import android.text.TextPaint
import android.util.TypedValue
import android.view.View
import androidx.compose.ui.graphics.toArgb
import androidx.media3.common.text.Cue
import androidx.media3.common.text.CueGroup

/**
 * Custom subtitle overlay that renders ExoPlayer [Cue]s directly on a [Canvas] using
 * [Paint.setShadowLayer], giving a real, tight black drop shadow.
 *
 * ExoPlayer's built-in [androidx.media3.ui.SubtitleView] uses a luminance-based approach for
 * [androidx.media3.ui.CaptionStyleCompat.EDGE_TYPE_DROP_SHADOW] that ignores [edgeColor] and
 * always produces a white glow. Rendering cues ourselves at the Paint level is the only way to
 * get a real, controllable shadow colour.
 */
@androidx.media3.common.util.UnstableApi
internal class NuvioSubtitleOverlay(context: Context) : View(context) {

    private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
    }

    private var cues: List<Cue> = emptyList()
    private var style: SubtitleStyleState? = null

    // ── public API ────────────────────────────────────────────────────────────

    fun onCueGroup(cueGroup: CueGroup) {
        cues = cueGroup.cues
        invalidate()
    }

    fun applyStyle(newStyle: SubtitleStyleState) {
        style = newStyle
        invalidate()
    }

    // ── rendering ─────────────────────────────────────────────────────────────

    override fun onDraw(canvas: Canvas) {
        val style = style ?: return
        if (cues.isEmpty()) return

        val dm = resources.displayMetrics
        val textSizePx = TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_SP,
            style.fontSizeSp.toFloat(),
            dm,
        )

        textPaint.textSize = textSizePx
        textPaint.color = style.textColor.toArgb()
        textPaint.typeface = if (style.bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        textPaint.bgColor = Color.TRANSPARENT

        if (style.shadowEnabled) {
            // To make the shadow appear "attached" to the text like MX Player:
            // The blur radius should be larger than the offset, so the shadow bleeds under the text
            // and eliminates any gaps.
            val radius = 2.0f * style.shadowDensity * dm.density
            val dx = 1.0f * style.shadowDensity * dm.density
            val dy = 1.0f * style.shadowDensity * dm.density
            textPaint.setShadowLayer(radius, dx, dy, Color.BLACK)
            setLayerType(LAYER_TYPE_SOFTWARE, null) // required for setShadowLayer on text
        } else {
            textPaint.clearShadowLayer()
            setLayerType(LAYER_TYPE_HARDWARE, null)
        }

        val availableWidth = width.toFloat()
        val cx = width / 2f

        // Accumulate lines from all cues bottom-to-top
        val allLines = cues
            .mapNotNull { it.text?.toString()?.trim()?.takeIf { t -> t.isNotEmpty() } }
            .flatMap { it.split("\n") }
            .reversed()

        val lineSpacing = textSizePx * 1.25f
        val baseBottomPaddingFraction = 0.08f + (style.bottomOffset / 1000f).coerceIn(0f, 0.2f)
        var y = height * (1f - baseBottomPaddingFraction)

        for (line in allLines) {
            y -= lineSpacing
            // Background box if requested
            if (style.backgroundColor.alpha > 0) {
                val boxPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = style.backgroundColor.toArgb()
                }
                val tw = textPaint.measureText(line)
                val pad = 4f * dm.density
                canvas.drawRect(cx - tw / 2 - pad, y - textSizePx - pad, cx + tw / 2 + pad, y + pad, boxPaint)
            }
            canvas.drawText(line, cx, y, textPaint)
        }
    }
}
