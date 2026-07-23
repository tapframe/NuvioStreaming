package com.nuvio.app.features.telegram

object TelegramSearchMatcher {

    private const val SEP = """[\s._\-x+,&:]{0,2}"""
    private const val SEP_MID = """[\s._\-x+,&:]{0,4}"""
    private val EPISODE_PATTERN = Regex(
        """[Ss][e]?(?:ason)?$SEP(\d{1,2})${SEP_MID}[Ee][p]?(?:isode)?$SEP(\d{1,4})""" +
        """|ע(?:ונה)?$SEP(\d{1,2})${SEP_MID}פ(?:רק)?$SEP(\d{1,4})""",
        RegexOption.IGNORE_CASE
    )
    private val EPISODE_ONLY_PATTERN = Regex("""פ(?:רק)?[\s._\-x+,&:]{0,2}(\d{1,4})""")
    private val YEAR_PATTERN = Regex("""\b(19|20)\d{2}\b""")
    private val NOISE = Regex("""[._\-\[\]()'",!?:]""")
    private val MULTI_SPACE = Regex("""\s+""")
    private val SIZE_SUFFIX = Regex("""\.(mkv|mp4|avi|mov|wmv|m4v|ts|m2ts)$""", RegexOption.IGNORE_CASE)
    private val HEBREW_RANGE = 0x0590..0x05FF

    fun score(
        fileName: String,
        caption: String,
        title: String,
        localizedTitle: String? = null,
        englishTitle: String? = null,
        year: Int?,
        season: Int?,
        episode: Int?
    ): Int {
        val combined = "$fileName $caption"
        val normalizedCombined = normalize(combined)
        val normalizedTitle = normalize(title)
        val normalizedLocalized = localizedTitle?.let { normalize(it) }
        val normalizedEnglish = englishTitle?.let { normalize(it) }

        val engMatch = normalizedEnglish != null && normalizedEnglish.isNotBlank() && normalizedCombined.contains(normalizedEnglish)
        val locMatch = normalizedLocalized != null && normalizedLocalized.isNotBlank() && normalizedCombined.contains(normalizedLocalized)
        val appMatch = normalizedCombined.contains(normalizedTitle)

        if (!engMatch && !locMatch && !appMatch) return 0

        var score = 60

        if (year != null) {
            val fileYears = YEAR_PATTERN.findAll(combined).map { it.value.toInt() }.toList()
            score += when {
                fileYears.contains(year) -> 20
                fileYears.any { kotlin.math.abs(it - year) == 1 } -> 5
                fileYears.isEmpty() -> 5
                else -> -10
            }
        }

        if (season != null && episode != null) {
            val seFile = extractSeasonEpisode(fileName)
            val seCaption = extractSeasonEpisode(caption)
            val rightSE = (seFile?.first == season && seFile.second == episode) ||
                    (seCaption?.first == season && seCaption.second == episode)
            when {
                rightSE -> score += 20
                seFile != null || seCaption != null -> return 0
                season == 1 -> {
                    val epFile = extractEpisodeOnly(fileName)
                    val epCaption = extractEpisodeOnly(caption)
                    when {
                        epFile == episode || epCaption == episode -> score += 20
                        epFile != null || epCaption != null -> return 0
                        else -> score -= 10
                    }
                }
                else -> score -= 10
            }
        } else if (season == null) {
            if (EPISODE_PATTERN.containsMatchIn(combined) || EPISODE_PATTERN.containsMatchIn(normalizedCombined)) {
                score -= 20
            }
        }

        return score.coerceIn(0, 100)
    }

    private fun extractSeasonEpisode(text: String): Pair<Int, Int>? {
        val m = EPISODE_PATTERN.find(text) ?: EPISODE_PATTERN.find(normalize(text)) ?: return null
        val s = m.groupValues[1].toIntOrNull() ?: m.groupValues[3].toIntOrNull() ?: return null
        val e = m.groupValues[2].toIntOrNull() ?: m.groupValues[4].toIntOrNull() ?: return null
        return s to e
    }

    private fun extractEpisodeOnly(text: String): Int? {
        val m = EPISODE_ONLY_PATTERN.find(text) ?: EPISODE_ONLY_PATTERN.find(normalize(text)) ?: return null
        return m.groupValues[1].toIntOrNull()
    }

    fun buildMovieQueries(title: String, year: Int?, localizedTitle: String? = null, englishTitle: String? = null): List<String> {
        val primary = englishTitle?.let { cleanTitle(it) } ?: cleanTitle(title)
        val localized = localizedTitle?.let { cleanTitle(it) }
        val queries = mutableListOf<String>()
        if (year != null) queries.add("$primary $year")
        queries.add(primary)
        if (localized != null && !localized.equals(primary, ignoreCase = true)) {
            if (year != null) queries.add("$localized $year")
            queries.add(localized)
        }
        return queries.distinct()
    }

    fun buildSeriesQueries(
        title: String,
        season: Int,
        episode: Int,
        localizedTitle: String? = null,
        englishTitle: String? = null,
        languageCode: String = "en"
    ): List<String> {
        val engBase = englishTitle?.let { cleanTitle(it) } ?: cleanTitle(title)
        val locBase = localizedTitle?.let { cleanTitle(it) }
        val titlesAreSame = locBase == null || locBase.equals(engBase, ignoreCase = true)
        val s = season.toString()
        val e = episode.toString()
        val s2 = season.toString().padStart(2, '0')
        val e2 = episode.toString().padStart(2, '0')

        val queries = mutableListOf<String>()

        if (languageCode == "he") {
            val hebTitle = if (titlesAreSame) engBase else locBase ?: engBase
            queries += listOf(
                "$hebTitle ע$s פ$e",
                "$hebTitle ע${s}פ${e}",
                "$hebTitle עונה $s פרק $e",
            )
            if (season == 1) queries += listOf("$hebTitle פ$e", "$hebTitle פרק $e")
        }

        if (!titlesAreSame && locBase != null) {
            queries += listOf(
                "$locBase s${s}e${e}",
                "$locBase s${s2}e${e2}",
                "$locBase s$s e$e",
                "$locBase s$s2 e$e2",
            )
        }

        queries += listOf(
            "$engBase s${s}e${e}",
            "$engBase s${s2}e${e2}",
            "$engBase s$s e$e",
            "$engBase s$s2 e$e2",
        )

        return queries.map { it.lowercase() }.distinct()
    }

    fun isHebrew(s: String) = s.any { it.code in HEBREW_RANGE }

    private fun cleanTitle(title: String): String {
        val stripped = title.replace(":", "").replace("  ", " ").trim()
        return stripped
    }

    private fun normalize(text: String): String =
        text.replace(SIZE_SUFFIX, "")
            .replace(NOISE, " ")
            .replace(MULTI_SPACE, " ")
            .trim()
            .lowercase()
}
