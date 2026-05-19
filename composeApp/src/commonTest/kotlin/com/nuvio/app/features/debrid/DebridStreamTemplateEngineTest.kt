package com.nuvio.app.features.debrid

import kotlin.test.Test
import kotlin.test.assertEquals

class DebridStreamTemplateEngineTest {
    private val engine = DebridStreamTemplateEngine()

    @Test
    fun `renders nested condition branches and transforms`() {
        val rendered = engine.render(
            "{stream.resolution::=2160p[\"4K {service.shortName} \"||\"\"]}{stream.title::title}",
            mapOf(
                "stream.resolution" to "2160p",
                "stream.title" to "sample movie",
                "service.shortName" to "RD",
            ),
        )

        assertEquals("4K RD Sample Movie", rendered)
    }

    @Test
    fun `formats bytes and joins list values`() {
        val rendered = engine.render(
            "{stream.size::bytes} {stream.audioTags::join(' | ')}",
            mapOf(
                "stream.size" to 1_610_612_736L,
                "stream.audioTags" to listOf("DTS", "Atmos"),
            ),
        )

        assertEquals("1.5 GB DTS | Atmos", rendered)
    }

    @Test
    fun `renders Debrid size values as readable text while keeping numeric comparisons`() {
        val rendered = engine.render(
            "{stream.size::>0[\"{stream.size}\"||\"\"]}",
            mapOf("stream.size" to DebridTemplateBytes(7_361_184_308L)),
        )

        assertEquals("6.9 GB", rendered)
    }
}
