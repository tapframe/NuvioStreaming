package com.nuvio.tv.ui.navigation

import java.net.URLEncoder

sealed class Screen(val route: String) {
    data object Home : Screen("home")
    data object Detail : Screen("detail/{itemId}/{itemType}?addonBaseUrl={addonBaseUrl}") {
        private fun encode(value: String): String =
            URLEncoder.encode(value, "UTF-8").replace("+", "%20")

        fun createRoute(itemId: String, itemType: String, addonBaseUrl: String? = null): String {
            val encodedAddon = addonBaseUrl?.let { encode(it) } ?: ""
            return "detail/$itemId/$itemType?addonBaseUrl=$encodedAddon"
        }
    }
    data object Stream : Screen("stream/{videoId}/{contentType}/{title}?poster={poster}&backdrop={backdrop}&logo={logo}&season={season}&episode={episode}&episodeName={episodeName}&genres={genres}&year={year}&contentId={contentId}&contentName={contentName}") {
        private fun encode(value: String): String = 
            URLEncoder.encode(value, "UTF-8").replace("+", "%20")
        
        fun createRoute(
            videoId: String,
            contentType: String,
            title: String,
            poster: String? = null,
            backdrop: String? = null,
            logo: String? = null,
            season: Int? = null,
            episode: Int? = null,
            episodeName: String? = null,
            genres: String? = null,
            year: String? = null,
            contentId: String? = null,
            contentName: String? = null
        ): String {
            val encodedTitle = encode(title)
            val encodedPoster = poster?.let { encode(it) } ?: ""
            val encodedBackdrop = backdrop?.let { encode(it) } ?: ""
            val encodedLogo = logo?.let { encode(it) } ?: ""
            val encodedEpisodeName = episodeName?.let { encode(it) } ?: ""
            val encodedGenres = genres?.let { encode(it) } ?: ""
            val encodedYear = year?.let { encode(it) } ?: ""
            val encodedContentId = contentId?.let { encode(it) } ?: ""
            val encodedContentName = contentName?.let { encode(it) } ?: ""
            return "stream/$videoId/$contentType/$encodedTitle?poster=$encodedPoster&backdrop=$encodedBackdrop&logo=$encodedLogo&season=${season ?: ""}&episode=${episode ?: ""}&episodeName=$encodedEpisodeName&genres=$encodedGenres&year=$encodedYear&contentId=$encodedContentId&contentName=$encodedContentName"
        }
    }
    data object Player : Screen("player/{streamUrl}/{title}?headers={headers}&contentId={contentId}&contentType={contentType}&contentName={contentName}&poster={poster}&backdrop={backdrop}&logo={logo}&videoId={videoId}&season={season}&episode={episode}&episodeTitle={episodeTitle}") {
        private fun encode(value: String): String = 
            URLEncoder.encode(value, "UTF-8").replace("+", "%20")
        
        fun createRoute(
            streamUrl: String,
            title: String,
            headers: Map<String, String>? = null,
            contentId: String? = null,
            contentType: String? = null,
            contentName: String? = null,
            poster: String? = null,
            backdrop: String? = null,
            logo: String? = null,
            videoId: String? = null,
            season: Int? = null,
            episode: Int? = null,
            episodeTitle: String? = null
        ): String {
            val encodedUrl = encode(streamUrl)
            val encodedTitle = encode(title)
            val encodedHeaders = headers?.entries?.joinToString("&") { (k, v) ->
                "${encode(k)}=${encode(v)}"
            }?.let { encode(it) } ?: ""
            val encodedContentId = contentId?.let { encode(it) } ?: ""
            val encodedContentType = contentType?.let { encode(it) } ?: ""
            val encodedContentName = contentName?.let { encode(it) } ?: ""
            val encodedPoster = poster?.let { encode(it) } ?: ""
            val encodedBackdrop = backdrop?.let { encode(it) } ?: ""
            val encodedLogo = logo?.let { encode(it) } ?: ""
            val encodedVideoId = videoId?.let { encode(it) } ?: ""
            val encodedEpisodeTitle = episodeTitle?.let { encode(it) } ?: ""
            return "player/$encodedUrl/$encodedTitle?headers=$encodedHeaders&contentId=$encodedContentId&contentType=$encodedContentType&contentName=$encodedContentName&poster=$encodedPoster&backdrop=$encodedBackdrop&logo=$encodedLogo&videoId=$encodedVideoId&season=${season ?: ""}&episode=${episode ?: ""}&episodeTitle=$encodedEpisodeTitle"
        }
    }
    data object Search : Screen("search")
    data object Library : Screen("library")
    data object Settings : Screen("settings")
    data object TmdbSettings : Screen("tmdb_settings")
    data object AddonManager : Screen("addon_manager")
    data object Plugins : Screen("plugins")
}
