package com.nuvio.app.features.player

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ParentalGuideRepositoryTest {

    @Test
    fun `dominant severity ignores none when none has more votes`() {
        val category = ImdbApiParentsGuideCategory(
            category = "VIOLENCE",
            severityBreakdowns = listOf(
                ImdbApiSeverityBreakdown("none", 12),
                ImdbApiSeverityBreakdown("mild", 7),
                ImdbApiSeverityBreakdown("moderate", 3),
            ),
        )

        assertNull(resolveParentalGuideSeverity(category))
    }

    @Test
    fun `dominant severity chooses highest voted non-none severity`() {
        val category = ImdbApiParentsGuideCategory(
            category = "VIOLENCE",
            severityBreakdowns = listOf(
                ImdbApiSeverityBreakdown("none", 2),
                ImdbApiSeverityBreakdown("mild", 5),
                ImdbApiSeverityBreakdown("severe", 9),
            ),
        )

        assertEquals("severe", resolveParentalGuideSeverity(category))
    }

    @Test
    fun `warnings are sorted by severity and localized`() {
        val warnings = buildParentalWarnings(
            guide = ParentalGuideResult(
                nudity = "mild",
                violence = "severe",
                profanity = "moderate",
            ),
            labels = ParentalGuideLabels(
                nudity = "Nudity",
                violence = "Violence",
                profanity = "Profanity",
                alcohol = "Alcohol/Drugs",
                frightening = "Frightening",
                severe = "Severe",
                moderate = "Moderate",
                mild = "Mild",
            ),
        )

        assertEquals(listOf("Violence", "Profanity", "Nudity"), warnings.map { it.label })
        assertEquals(listOf("Severe", "Moderate", "Mild"), warnings.map { it.severity })
    }

    @Test
    fun `ids are extracted from common player id shapes`() {
        assertEquals("tt15398776", extractParentalGuideImdbId("tt15398776:1:2"))
        assertEquals("tt15398776", extractParentalGuideImdbId("series:tt15398776:1:2"))
        assertEquals(12345, extractParentalGuideTmdbId("tmdb:12345"))
        assertEquals(12345, extractParentalGuideTmdbId("series:tmdb:12345"))
    }
}
