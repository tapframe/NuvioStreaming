package com.nuvio.app.features.debrid

import com.nuvio.app.features.streams.StreamParser
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class DebridStreamFormatterTest {
    private val formatter = DebridStreamFormatter()

    @Test
    fun `formats real client stream episode fields and behavior size`() {
        val stream = StreamParser.parse(
            payload = clientStreamPayload(),
            addonName = "Torbox Instant",
            addonId = "debrid:torbox",
        ).single()

        val formatted = formatter.format(
            stream = stream,
            settings = DebridSettings(
                enabled = true,
                torboxApiKey = "key",
                streamDescriptionTemplate = CLIENT_TEMPLATE,
            ),
        )

        val description = formatted.description.orEmpty()
        assertEquals(0, stream.clientResolve?.fileIdx)
        assertContains(description, "S05")
        assertContains(description, "E02")
        assertContains(description, "6.3 GB")
        assertFalse(description.contains("6761331156"))
    }

    @Test
    fun `formats season episode from parsed fields when top level resolve omits them`() {
        val stream = StreamParser.parse(
            payload = clientStreamPayload(includeTopLevelSeasonEpisode = false),
            addonName = "Torbox Instant",
            addonId = "debrid:torbox",
        ).single()

        val formatted = formatter.format(
            stream = stream,
            settings = DebridSettings(
                enabled = true,
                torboxApiKey = "key",
                streamDescriptionTemplate = CLIENT_TEMPLATE,
            ),
        )

        val description = formatted.description.orEmpty()
        assertContains(description, "S05")
        assertContains(description, "E02")
        assertContains(description, "6.3 GB")
    }

    private fun clientStreamPayload(includeTopLevelSeasonEpisode: Boolean = true): String {
        val seasonEpisode = if (includeTopLevelSeasonEpisode) {
            """
            "season": 5,
            "episode": 2,
            """.trimIndent()
        } else {
            ""
        }
        return """
            {
              "streams": [
                {
                  "name": "TB 2160p cached",
                  "description": "The Boys S05E02 Teenage Kix 2160p AMZN WEB-DL DDP5 1 Atmos DV HDR10Plus H 265-Kitsune.mkv",
                  "clientResolve": {
                    "type": "debrid",
                    "service": "torbox",
                    "isCached": true,
                    "infoHash": "cb7286fb422ed0643037523e7b09446734e9dbc4",
                    "sources": [],
                    "fileIdx": "0",
                    "filename": "The Boys S05E02 Teenage Kix 2160p AMZN WEB-DL DDP5 1 Atmos DV HDR10Plus H 265-Kitsune.mkv",
                    "title": "The Boys",
                    "torrentName": "The Boys S05E02 Teenage Kix 2160p AMZN WEB-DL DDP5 1 Atmos DV HDR10Plus H 265-Kitsune.mkv",
                    $seasonEpisode
                    "stream": {
                      "raw": {
                        "parsed": {
                          "resolution": "2160p",
                          "quality": "WEB-DL",
                          "codec": "hevc",
                          "audio": ["Atmos", "Dolby Digital Plus"],
                          "channels": ["5.1"],
                          "hdr": ["DV", "HDR10+"],
                          "group": "Kitsune",
                          "seasons": [5],
                          "episodes": [2],
                          "raw_title": "The Boys S05E02 Teenage Kix 2160p AMZN WEB-DL DDP5 1 Atmos DV HDR10Plus H 265-Kitsune.mkv"
                        }
                      }
                    }
                  },
                  "behaviorHints": {
                    "filename": "The Boys S05E02 Teenage Kix 2160p AMZN WEB-DL DDP5 1 Atmos DV HDR10Plus H 265-Kitsune.mkv",
                    "videoSize": 6761331156
                  }
                }
              ]
            }
        """.trimIndent()
    }

    private companion object {
        private const val CLIENT_TEMPLATE =
            "{stream.title::exists[\"🍿 {stream.title::title} \"||\"\"]}{stream.year::exists[\"({stream.year}) \"||\"\"]}\n" +
                "{stream.season::>=0[\"🍂 S\"||\"\"]}{stream.season::<=9[\"0\"||\"\"]}{stream.season::>0[\"{stream.season} \"||\"\"]}{stream.episode::>=0[\"🎞️ E\"||\"\"]}{stream.episode::<=9[\"0\"||\"\"]}{stream.episode::>0[\"{stream.episode} \"||\"\"]}\n" +
                "{stream.quality::exists[\"🎥 {stream.quality} \"||\"\"]}{stream.visualTags::exists[\"📺 {stream.visualTags::join(' | ')} \"||\"\"]}\n" +
                "{stream.audioTags::exists[\"🎧 {stream.audioTags::join(' | ')} \"||\"\"]}{stream.audioChannels::exists[\"🔊 {stream.audioChannels::join(' | ')}\"||\"\"]}\n" +
                "{stream.size::>0[\"📦 {stream.size::bytes} \"||\"\"]}{stream.encode::exists[\"🎞️ {stream.encode} \"||\"\"]}{stream.indexer::exists[\"📡{stream.indexer}\"||\"\"]}\n" +
                "{service.cached::istrue[\"⚡Ready \"||\"\"]}{service.cached::isfalse[\"❌ Not Ready \"||\"\"]}{service.shortName::exists[\"({service.shortName}) \"||\"\"]}{stream.type::=Debrid[\"☁️ Debrid \"||\"\"]}🔍{addon.name}"
    }
}
