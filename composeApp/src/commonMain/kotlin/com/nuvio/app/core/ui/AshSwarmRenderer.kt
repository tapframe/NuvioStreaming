package com.nuvio.app.core.ui

import androidx.compose.ui.graphics.drawscope.DrawScope

internal expect val ashSwarmMaxGrainBudget: Int

internal expect class AshSwarmRenderer(maxGrains: Int) {
    fun draw(
        scope: DrawScope,
        count: Int,
        centersX: FloatArray,
        centersY: FloatArray,
        halfWidths: FloatArray,
        halfHeights: FloatArray,
        colors: IntArray,
    )
}
