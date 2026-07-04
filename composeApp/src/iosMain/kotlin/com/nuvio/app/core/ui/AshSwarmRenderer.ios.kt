package com.nuvio.app.core.ui

import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.nativeCanvas
import org.jetbrains.skia.BlendMode
import org.jetbrains.skia.Paint
import org.jetbrains.skia.VertexMode

internal actual val ashSwarmMaxGrainBudget: Int = 26000

internal actual class AshSwarmRenderer actual constructor(maxGrains: Int) {
    private val positions = FloatArray(maxGrains * 12)
    private val vertexColors = IntArray(maxGrains * 6)
    private val paint = Paint()
    private var lastVertexCount = 0

    actual fun draw(
        scope: DrawScope,
        count: Int,
        centersX: FloatArray,
        centersY: FloatArray,
        halfWidths: FloatArray,
        halfHeights: FloatArray,
        colors: IntArray,
    ) {
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
        val vertexCount = count * 6
        if (vertexCount < lastVertexCount) {
            positions.fill(0f, fromIndex = vertexCount * 2, toIndex = lastVertexCount * 2)
            vertexColors.fill(0, fromIndex = vertexCount, toIndex = lastVertexCount)
        }
        lastVertexCount = vertexCount
        if (vertexCount == 0) return

        scope.drawContext.canvas.nativeCanvas.drawVertices(
            vertexMode = VertexMode.TRIANGLES,
            positions = positions,
            colors = vertexColors,
            texCoords = null,
            indices = null,
            blendMode = BlendMode.DST,
            paint = paint,
        )
    }
}
