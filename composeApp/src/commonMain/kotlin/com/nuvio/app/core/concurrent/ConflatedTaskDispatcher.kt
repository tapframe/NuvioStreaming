package com.nuvio.app.core.concurrent

import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized

internal class ConflatedTaskDispatcher<T>(
    private val schedule: (() -> Unit) -> Unit,
    private val consume: (T) -> Unit,
) {
    private data class Pending<T>(val value: T)

    private val lock = SynchronizedObject()
    private var pending: Pending<T>? = null
    private var drainScheduled = false

    fun dispatch(value: T) {
        synchronized(lock) {
            pending = Pending(value)
        }
        scheduleDrain()
    }

    private fun scheduleDrain() {
        val shouldSchedule = synchronized(lock) {
            if (drainScheduled) {
                false
            } else {
                drainScheduled = true
                true
            }
        }
        if (!shouldSchedule) return

        try {
            schedule(::drain)
        } catch (error: Throwable) {
            synchronized(lock) {
                drainScheduled = false
            }
            throw error
        }
    }

    private fun drain() {
        try {
            while (true) {
                val next = synchronized(lock) {
                    pending.also { pending = null }
                } ?: return
                consume(next.value)
            }
        } finally {
            val hasPending = synchronized(lock) {
                drainScheduled = false
                pending != null
            }
            if (hasPending) scheduleDrain()
        }
    }
}
