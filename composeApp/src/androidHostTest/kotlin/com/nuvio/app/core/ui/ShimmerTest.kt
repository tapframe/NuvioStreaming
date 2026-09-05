package com.nuvio.app.core.ui

import androidx.compose.runtime.AbstractApplier
import androidx.compose.runtime.BroadcastFrameClock
import androidx.compose.runtime.Composition
import androidx.compose.runtime.Recomposer
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ShimmerTest {
    @Test
    fun `animation changes the brush without recomposing its consumer and follows theme changes`() = runBlocking {
        val frameClock = BroadcastFrameClock()
        val recomposer = Recomposer(coroutineContext + frameClock)
        val composition = Composition(EmptyApplier(), recomposer)
        val runner = launch(frameClock) { recomposer.runRecomposeAndApplyChanges() }
        val baseColor = mutableStateOf(Color.DarkGray)
        lateinit var brush: State<Brush>
        var compositions = 0

        suspend fun frame(millis: Long) {
            Snapshot.sendApplyNotifications()
            yield()
            frameClock.sendFrame(millis * 1_000_000L)
            yield()
            Snapshot.sendApplyNotifications()
            yield()
        }

        try {
            composition.setContent {
                brush = rememberShimmerBrush(baseColor.value, Color.LightGray)
                SideEffect { compositions++ }
            }
            frame(0)
            val initialBrush = brush.value
            val initialCompositions = compositions

            frame(300)
            frame(600)

            assertNotEquals(initialBrush, brush.value)
            assertEquals(initialCompositions, compositions)

            baseColor.value = Color.Blue
            frame(600)

            assertEquals(initialCompositions + 1, compositions)
            assertEquals(
                Brush.linearGradient(
                    colors = listOf(Color.Blue, Color.LightGray, Color.Blue),
                    start = Offset(300f, 0f),
                    end = Offset(500f, 0f),
                ),
                brush.value,
            )
        } finally {
            composition.dispose()
            recomposer.cancel()
            runner.join()
        }
    }

    private class EmptyApplier : AbstractApplier<Unit>(Unit) {
        override fun insertBottomUp(index: Int, instance: Unit) = Unit
        override fun insertTopDown(index: Int, instance: Unit) = Unit
        override fun move(from: Int, to: Int, count: Int) = Unit
        override fun remove(index: Int, count: Int) = Unit
        override fun onClear() = Unit
    }
}
