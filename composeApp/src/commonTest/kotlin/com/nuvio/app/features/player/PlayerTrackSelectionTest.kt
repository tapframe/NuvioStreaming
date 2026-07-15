package com.nuvio.app.features.player

import kotlin.test.Test
import kotlin.test.assertEquals

class PlayerTrackSelectionTest {

    @Test
    fun `matches iso 639-1 language tag`() {
        val tracks = listOf(track(0, "ar", "Arabic"), track(1, "en", "English"))
        assertEquals(1, findPreferredSubtitleTrackIndex(tracks, listOf("en")))
    }

    @Test
    fun `matches iso 639-2 language tag`() {
        val tracks = listOf(track(0, "ara", "Arabic"), track(1, "eng", "English"))
        assertEquals(1, findPreferredSubtitleTrackIndex(tracks, listOf("en")))
    }

    @Test
    fun `matches regional language tag`() {
        val tracks = listOf(track(0, "es-419", "Spanish"), track(1, "en-US", "English (US)"))
        assertEquals(1, findPreferredSubtitleTrackIndex(tracks, listOf("en")))
    }

    @Test
    fun `falls back to label when language tag is missing`() {
        val tracks = listOf(track(0, null, "Arabic"), track(1, null, "English"))
        assertEquals(1, findPreferredSubtitleTrackIndex(tracks, listOf("en")))
    }

    @Test
    fun `falls back to label when language tag is und`() {
        val tracks = listOf(track(0, "und", "Arabic"), track(1, "und", "English"))
        assertEquals(1, findPreferredSubtitleTrackIndex(tracks, listOf("en")))
    }

    @Test
    fun `label fallback handles suffixed labels`() {
        val tracks = listOf(track(0, null, "Arabic"), track(1, null, "English [SDH]"))
        assertEquals(1, findPreferredSubtitleTrackIndex(tracks, listOf("en")))
    }

    @Test
    fun `tagged track wins over label-only track`() {
        val tracks = listOf(track(0, null, "English"), track(1, "en", "English (CC)"))
        assertEquals(1, findPreferredSubtitleTrackIndex(tracks, listOf("en")))
    }

    @Test
    fun `label fallback does not hijack tracks with a usable foreign tag`() {
        val tracks = listOf(track(0, "ar", "English translation notes"))
        assertEquals(-1, findPreferredSubtitleTrackIndex(tracks, listOf("en")))
    }

    @Test
    fun `returns -1 when nothing matches`() {
        val tracks = listOf(track(0, "ar", "Arabic"), track(1, "it", "Italian"))
        assertEquals(-1, findPreferredSubtitleTrackIndex(tracks, listOf("en")))
    }

    @Test
    fun `secondary target used when primary unavailable`() {
        val tracks = listOf(track(0, "ar", "Arabic"), track(1, "es", "Spanish"))
        assertEquals(1, findPreferredSubtitleTrackIndex(tracks, listOf("en", "es")))
    }

    @Test
    fun `pt tagged track with brazilian label matches pt-BR preference`() {
        val tracks = listOf(track(0, "pt", "Português (Portugal)"), track(1, "pt", "Português (Brasil)"))
        assertEquals(1, findPreferredSubtitleTrackIndex(tracks, listOf("pt-BR")))
    }

    @Test
    fun `pt preference does not select a brazilian variant track`() {
        val tracks = listOf(track(0, "pt", "Português (Brasil)"))
        assertEquals(-1, findPreferredSubtitleTrackIndex(tracks, listOf("pt")))
    }

    @Test
    fun `pt-BR preference does not select a plain european pt track`() {
        val tracks = listOf(track(0, "pt", "Português (Portugal)"))
        assertEquals(-1, findPreferredSubtitleTrackIndex(tracks, listOf("pt-BR")))
    }

    @Test
    fun `pob tagged track matches pt-BR preference`() {
        val tracks = listOf(track(0, "pob", "Portuguese"))
        assertEquals(0, findPreferredSubtitleTrackIndex(tracks, listOf("pt-BR")))
    }

    @Test
    fun `es tagged track with latino label matches es-419 preference`() {
        val tracks = listOf(track(0, "es", "Español (España)"), track(1, "es", "Español (Latinoamérica)"))
        assertEquals(1, findPreferredSubtitleTrackIndex(tracks, listOf("es-419")))
    }

    @Test
    fun `es preference does not select a latino variant track`() {
        val tracks = listOf(track(0, "es", "Español (Latinoamérica)"))
        assertEquals(-1, findPreferredSubtitleTrackIndex(tracks, listOf("es")))
    }

    @Test
    fun `untagged brazilian label matches pt-BR preference via label fallback`() {
        val tracks = listOf(track(0, null, "Português (Brasil)"))
        assertEquals(0, findPreferredSubtitleTrackIndex(tracks, listOf("pt-BR")))
    }

    private fun track(index: Int, language: String?, label: String) = SubtitleTrack(
        index = index,
        id = index.toString(),
        label = label,
        language = language,
        isSelected = false,
        isForced = false,
    )
}
