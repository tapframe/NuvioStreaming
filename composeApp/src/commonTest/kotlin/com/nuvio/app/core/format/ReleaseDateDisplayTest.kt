package com.nuvio.app.core.format

import kotlin.test.Test
import kotlin.test.assertEquals

class ReleaseDateDisplayTest {
    @Test
    fun formatsIsoDate() {
        assertEquals("2025 February 1", formatReleaseDateForDisplay("2025-02-01"))
    }

    @Test
    fun stripsTimePortion() {
        assertEquals("2024 January 15", formatReleaseDateForDisplay("2024-01-15T12:30:00Z"))
    }

    @Test
    fun leavesYearOnlyUnchanged() {
        assertEquals("2024", formatReleaseDateForDisplay("2024"))
    }

    @Test
    fun leavesNonIsoUnchanged() {
        assertEquals("TBA", formatReleaseDateForDisplay("TBA"))
    }

    @Test
    fun extractsYearFromIso() {
        assertEquals(2025, extractReleaseYearForDisplay("2025-03-15"))
    }

    @Test
    fun extractsYearFromYearOnly() {
        assertEquals(2024, extractReleaseYearForDisplay("2024"))
    }

    @Test
    fun formatsIsoDateWithoutYear() {
        assertEquals("February 1", formatReleaseDateWithoutYear("2025-02-01"))
    }

    @Test
    fun formatReleaseDateWithoutYearStripsTimePortion() {
        assertEquals("January 15", formatReleaseDateWithoutYear("2024-01-15T12:30:00Z"))
    }

    @Test
    fun formatReleaseDateWithoutYearLeavesYearOnlyUnchanged() {
        assertEquals("2024", formatReleaseDateWithoutYear("2024"))
    }

    @Test
    fun formatReleaseDateWithoutYearLeavesNonIsoUnchanged() {
        assertEquals("TBA", formatReleaseDateWithoutYear("TBA"))
    }
}
