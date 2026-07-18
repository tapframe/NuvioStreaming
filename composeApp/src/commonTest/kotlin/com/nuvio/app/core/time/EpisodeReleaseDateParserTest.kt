package com.nuvio.app.core.time

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EpisodeReleaseDateParserTest {
    @Test
    fun zonedTimestampUsesViewerLocalCalendarDate() {
        assertEquals(
            "2026-07-15",
            parseEpisodeReleaseLocalDate("2026-07-16T00:00:00.000Z") { "2026-07-15" },
        )
    }

    @Test
    fun plainDateIsPreservedWithoutViewerTimezoneConversion() {
        assertEquals(
            "2026-07-16",
            parseEpisodeReleaseLocalDate("2026-07-16") { "should-not-be-used" },
        )
    }

    @Test
    fun zonedReleaseStaysUnavailableUntilExactInstant() {
        val exact = requireNotNull(parseEpisodeReleaseEpochMs("2026-07-15T15:00:00Z"))

        assertFalse(isEpisodeReleaseAired("2026-07-15T15:00:00Z", exact - 1L)!!)
        assertTrue(isEpisodeReleaseAired("2026-07-15T15:00:00Z", exact)!!)
    }

    @Test
    fun dateOnlyReleaseStartsAtUtcMidnight() {
        val utcMidnight = requireNotNull(parseEpisodeReleaseEpochMs("2026-07-15T00:00:00Z"))

        assertEquals(utcMidnight, parseEpisodeReleaseEpochMs("2026-07-15"))
        assertFalse(isEpisodeReleaseAired("2026-07-15", utcMidnight - 1L)!!)
        assertTrue(isEpisodeReleaseAired("2026-07-15", utcMidnight)!!)
    }

    @Test
    fun offsetTimestampResolvesToSameInstant() {
        assertEquals(
            parseEpisodeReleaseEpochMs("2026-07-15T23:00:00Z"),
            parseEpisodeReleaseEpochMs("2026-07-16T01:00:00+02:00"),
        )
    }

    @Test
    fun invalidAndMissingValuesRemainUnknown() {
        assertNull(parseEpisodeReleaseLocalDate("not-a-date"))
        assertNull(parseEpisodeReleaseEpochMs(null))
        assertNull(isEpisodeReleaseAired("not-a-date"))
    }

    @Test
    fun countdownUsesViewerLocalDateForZonedTimestamp() {
        assertEquals(
            0,
            daysUntilEpisodeRelease("2026-07-15", "2026-07-16T00:00:00Z") { "2026-07-15" },
        )
    }
}
