package com.nuvio.app.features.debrid

import com.nuvio.app.features.streams.StreamClientResolve
import com.nuvio.app.features.streams.StreamClientResolveParsed
import com.nuvio.app.features.streams.StreamItem

class DebridStreamFormatter(
    private val engine: DebridStreamTemplateEngine = DebridStreamTemplateEngine(),
) {
    fun format(stream: StreamItem, settings: DebridSettings): StreamItem {
        if (!stream.isDirectDebridStream) return stream
        val values = buildValues(stream)
        val formattedName = engine.render(settings.streamNameTemplate, values)
            .lineSequence()
            .joinToString(" ") { it.trim() }
            .replace(Regex("\\s+"), " ")
            .trim()
        val formattedDescription = engine.render(settings.streamDescriptionTemplate, values)
            .lineSequence()
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .joinToString("\n")
            .trim()

        return stream.copy(
            name = formattedName.ifBlank { stream.name ?: DebridProviders.instantName(stream.clientResolve?.service) },
            description = formattedDescription.ifBlank { stream.description ?: stream.title },
        )
    }

    private fun buildValues(stream: StreamItem): Map<String, Any?> {
        val resolve = stream.clientResolve
        val raw = resolve?.stream?.raw
        val parsed = raw?.parsed
        val seasons = parsed?.seasons.orEmpty()
        val episodes = parsed?.episodes.orEmpty()
        val season = resolve?.season ?: seasons.singleOrFirstOrNull()
        val episode = resolve?.episode ?: episodes.singleOrFirstOrNull()
        val visualTags = buildList {
            addAll(parsed?.hdr.orEmpty())
            parsed?.bitDepth?.takeIf { it.isNotBlank() }?.let { add(it) }
        }
        val edition = parsed?.edition ?: buildEdition(parsed)

        return linkedMapOf(
            "stream.title" to (parsed?.parsedTitle ?: resolve?.title ?: stream.title),
            "stream.year" to parsed?.year,
            "stream.season" to season,
            "stream.episode" to episode,
            "stream.seasons" to seasons,
            "stream.episodes" to episodes,
            "stream.seasonEpisode" to buildSeasonEpisodeList(season, episode, seasons, episodes),
            "stream.formattedEpisodes" to formatEpisodes(episodes),
            "stream.formattedSeasons" to formatSeasons(seasons),
            "stream.resolution" to parsed?.resolution,
            "stream.library" to false,
            "stream.quality" to parsed?.quality,
            "stream.visualTags" to visualTags,
            "stream.audioTags" to parsed?.audio.orEmpty(),
            "stream.audioChannels" to parsed?.channels.orEmpty(),
            "stream.languages" to parsed?.languages.orEmpty(),
            "stream.languageEmojis" to parsed?.languages.orEmpty().map { languageEmoji(it) },
            "stream.size" to (raw?.size ?: stream.behaviorHints.videoSize)?.let(::DebridTemplateBytes),
            "stream.folderSize" to raw?.folderSize?.let(::DebridTemplateBytes),
            "stream.encode" to parsed?.codec?.uppercase(),
            "stream.indexer" to (raw?.indexer ?: raw?.tracker),
            "stream.network" to (parsed?.network ?: raw?.network),
            "stream.releaseGroup" to parsed?.group,
            "stream.duration" to parsed?.duration,
            "stream.edition" to edition,
            "stream.filename" to (raw?.filename ?: resolve?.filename ?: stream.behaviorHints.filename),
            "stream.regexMatched" to null,
            "stream.type" to streamType(resolve),
            "service.cached" to resolve?.isCached,
            "service.shortName" to serviceShortName(resolve),
            "service.name" to serviceName(resolve),
            "addon.name" to "Nuvio Direct Debrid",
        )
    }

    private fun streamType(resolve: StreamClientResolve?): String =
        when {
            resolve?.type.equals("debrid", ignoreCase = true) -> "Debrid"
            resolve?.type.equals("torrent", ignoreCase = true) -> "p2p"
            else -> resolve?.type.orEmpty()
        }

    private fun serviceShortName(resolve: StreamClientResolve?): String =
        resolve?.serviceExtension?.takeIf { it.isNotBlank() }
            ?: DebridProviders.shortName(resolve?.service)

    private fun serviceName(resolve: StreamClientResolve?): String =
        DebridProviders.displayName(resolve?.service)

    private fun buildEdition(parsed: StreamClientResolveParsed?): String? {
        if (parsed == null) return null
        return buildList {
            if (parsed.extended == true) add("extended")
            if (parsed.theatrical == true) add("theatrical")
            if (parsed.remastered == true) add("remastered")
            if (parsed.unrated == true) add("unrated")
        }.joinToString(" ").takeIf { it.isNotBlank() }
    }

    private fun buildSeasonEpisodeList(
        season: Int?,
        episode: Int?,
        seasons: List<Int>,
        episodes: List<Int>,
    ): List<String> {
        if (season != null && episode != null) return listOf("S${season.twoDigits()}E${episode.twoDigits()}")
        if (seasons.isEmpty() || episodes.isEmpty()) return emptyList()
        return seasons.flatMap { s -> episodes.map { e -> "S${s.twoDigits()}E${e.twoDigits()}" } }
    }

    private fun formatEpisodes(episodes: List<Int>): String =
        episodes.joinToString(" | ") { "E${it.twoDigits()}" }

    private fun formatSeasons(seasons: List<Int>): String =
        seasons.joinToString(" | ") { "S${it.twoDigits()}" }

    private fun List<Int>.singleOrFirstOrNull(): Int? =
        singleOrNull() ?: firstOrNull()

    private fun Int.twoDigits(): String = toString().padStart(2, '0')

    private fun languageEmoji(language: String): String =
        when (language.lowercase()) {
            "en", "eng", "english" -> "GB"
            "hi", "hin", "hindi" -> "IN"
            "ml", "mal", "malayalam" -> "IN"
            "ta", "tam", "tamil" -> "IN"
            "te", "tel", "telugu" -> "IN"
            "ja", "jpn", "japanese" -> "JP"
            "ko", "kor", "korean" -> "KR"
            "fr", "fre", "fra", "french" -> "FR"
            "es", "spa", "spanish" -> "ES"
            "de", "ger", "deu", "german" -> "DE"
            "it", "ita", "italian" -> "IT"
            "multi" -> "Multi"
            else -> language
        }
}
