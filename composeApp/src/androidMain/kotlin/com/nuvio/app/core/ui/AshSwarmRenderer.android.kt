package com.nuvio.app.core.ui

import android.graphics.Canvas as AndroidCanvas
import android.graphics.Paint as AndroidPaint
import android.os.Build
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.nativeCanvas

internal actual val ashSwarmMaxGrainBudget: Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) 26000 else 15000

internal actual class AshSwarmRenderer actual constructor(maxGrains: Int) {
    private val batched = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

    private val positions = if (batched) FloatArray(maxGrains * 12) else EMPTY_FLOATS
    private val vertexColors = if (batched) IntArray(maxGrains * 6) else EMPTY_INTS
    private val paint = AndroidPaint()

    actual fun draw(
        scope: DrawScope,
        count: Int,
        centersX: FloatArray,
        centersY: FloatArray,
        halfWidths: FloatArray,
        halfHeights: FloatArray,
        colors: IntArray,
    ) {
        if (count == 0) return
        if (!batched) {
            drawUnbatched(scope, count, centersX, centersY, halfWidths, halfHeights, colors)
            return
        }
        var pi = 0
        var ci = 0
        for (i in 0 until count) {
            val x0 = centersX[i] - halfWidths[i]
            val x1 = centersX[i] + halfWidths[i]
            val y0 = centersY[i] - halfHeights[i]
            val y1 = centersY[i] + halfHeights[i]
            positions[pi++] = x0; positions[pi++] = y0
            positions[pi++] = x1; positions[pi++] = y0
            positions[pi++] = x0; positions[pi++] = y1
            positions[pi++] = x1; positions[pi++] = y0
            positions[pi++] = x1; positions[pi++] = y1
            positions[pi++] = x0; positions[pi++] = y1
            val c = colors[i]
            vertexColors[ci++] = c; vertexColors[ci++] = c; vertexColors[ci++] = c
            vertexColors[ci++] = c; vertexColors[ci++] = c; vertexColors[ci++] = c
        }
        scope.drawContext.canvas.nativeCanvas.drawVertices(
            AndroidCanvas.VertexMode.TRIANGLES,
            count * 12,
            positions,
            0,
            null,
            0,
            vertexColors,
            0,
            null,
            0,
            0,
            paint,
        )
    }

    private fun drawUnbatched(
        scope: DrawScope,
        count: Int,
        centersX: FloatArray,
        centersY: FloatArray,
        halfWidths: FloatArray,
        halfHeights: FloatArray,
        colors: IntArray,
    ) {
        for (i in 0 until count) {
            val hw = halfWidths[i]
            val hh = halfHeights[i]
            scope.drawRect(
                color = Color(colors[i]),
                topLeft = Offset(centersX[i] - hw, centersY[i] - hh),
                size = Size(hw * 2f, hh * 2f),
            )
        }
    }

    private companion object {
        val EMPTY_FLOATS = FloatArray(0)
        val EMPTY_INTS = IntArray(0)
    }
}
