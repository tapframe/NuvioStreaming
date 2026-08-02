package com.nuvio.app.core.concurrent

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class ConflatedTaskDispatcherTest {
    @Test
    fun dispatchConsumesOnlyLatestPendingValue() {
        val scheduled = ArrayDeque<() -> Unit>()
        val consumed = mutableListOf<Int>()
        val dispatcher = ConflatedTaskDispatcher<Int>(
            schedule = scheduled::addLast,
            consume = consumed::add,
        )

        dispatcher.dispatch(1)
        dispatcher.dispatch(2)
        dispatcher.dispatch(3)

        assertEquals(1, scheduled.size)
        assertEquals(emptyList(), consumed)
        scheduled.removeFirst().invoke()
        assertEquals(listOf(3), consumed)
    }

    @Test
    fun valuesSubmittedWhileConsumingAreConflated() {
        val scheduled = ArrayDeque<() -> Unit>()
        val consumed = mutableListOf<Int>()
        lateinit var dispatcher: ConflatedTaskDispatcher<Int>
        dispatcher = ConflatedTaskDispatcher(
            schedule = scheduled::addLast,
            consume = { value ->
                consumed += value
                if (value == 1) {
                    dispatcher.dispatch(2)
                    dispatcher.dispatch(3)
                }
            },
        )

        dispatcher.dispatch(1)
        scheduled.removeFirst().invoke()

        assertEquals(listOf(1, 3), consumed)
        assertEquals(0, scheduled.size)
    }

    @Test
    fun consumerFailureDoesNotStallFutureDispatches() {
        val scheduled = ArrayDeque<() -> Unit>()
        val consumed = mutableListOf<Int>()
        val dispatcher = ConflatedTaskDispatcher<Int>(
            schedule = scheduled::addLast,
            consume = { value ->
                if (value == 1) error("failed")
                consumed += value
            },
        )

        dispatcher.dispatch(1)
        assertFailsWith<IllegalStateException> {
            scheduled.removeFirst().invoke()
        }
        dispatcher.dispatch(2)
        scheduled.removeFirst().invoke()

        assertEquals(listOf(2), consumed)
    }
}
