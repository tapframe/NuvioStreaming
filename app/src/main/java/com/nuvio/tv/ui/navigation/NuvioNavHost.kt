package com.nuvio.tv.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.nuvio.tv.ui.screens.detail.MetaDetailsScreen
import com.nuvio.tv.ui.screens.home.HomeScreen
import com.nuvio.tv.ui.screens.addon.AddonManagerScreen
import com.nuvio.tv.ui.screens.library.LibraryScreen
import com.nuvio.tv.ui.screens.player.PlayerScreen
import com.nuvio.tv.ui.screens.plugin.PluginScreen
import com.nuvio.tv.ui.screens.search.SearchScreen
import com.nuvio.tv.ui.screens.settings.SettingsScreen
import com.nuvio.tv.ui.screens.settings.TmdbSettingsScreen
import com.nuvio.tv.ui.screens.stream.StreamScreen

@Composable
fun NuvioNavHost(
    navController: NavHostController,
    startDestination: String = Screen.Home.route
) {
    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable(Screen.Home.route) {
            HomeScreen(
                onNavigateToDetail = { itemId, itemType, addonBaseUrl ->
                    navController.navigate(Screen.Detail.createRoute(itemId, itemType, addonBaseUrl))
                }
            )
        }

        composable(
            route = Screen.Detail.route,
            arguments = listOf(
                navArgument("itemId") { type = NavType.StringType },
                navArgument("itemType") { type = NavType.StringType },
                navArgument("addonBaseUrl") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                }
            )
        ) { backStackEntry ->
            MetaDetailsScreen(
                onBackPress = { navController.popBackStack() },
                onPlayClick = { videoId, contentType, contentId, title, poster, backdrop, logo, season, episode, episodeName, genres, year ->
                    navController.navigate(
                        Screen.Stream.createRoute(
                            videoId = videoId,
                            contentType = contentType,
                            title = title,
                            poster = poster,
                            backdrop = backdrop,
                            logo = logo,
                            season = season,
                            episode = episode,
                            episodeName = episodeName,
                            genres = genres,
                            year = year,
                            contentId = contentId,
                            contentName = title
                        )
                    )
                }
            )
        }

        composable(
            route = Screen.Stream.route,
            arguments = listOf(
                navArgument("videoId") { type = NavType.StringType },
                navArgument("contentType") { type = NavType.StringType },
                navArgument("title") { type = NavType.StringType },
                navArgument("poster") { 
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("backdrop") { 
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("logo") { 
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("season") { 
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("episode") { 
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("episodeName") { 
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("genres") { 
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("year") { 
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("contentId") { 
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("contentName") { 
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                }
            )
        ) {
            StreamScreen(
                onBackPress = { navController.popBackStack() },
                onStreamSelected = { playbackInfo ->
                    playbackInfo.url?.let { url ->
                        navController.navigate(
                            Screen.Player.createRoute(
                                streamUrl = url,
                                title = playbackInfo.title,
                                headers = playbackInfo.headers,
                                contentId = playbackInfo.contentId,
                                contentType = playbackInfo.contentType,
                                contentName = playbackInfo.contentName,
                                poster = playbackInfo.poster,
                                backdrop = playbackInfo.backdrop,
                                logo = playbackInfo.logo,
                                videoId = playbackInfo.videoId,
                                season = playbackInfo.season,
                                episode = playbackInfo.episode,
                                episodeTitle = playbackInfo.episodeTitle
                            )
                        )
                    }
                }
            )
        }

        composable(
            route = Screen.Player.route,
            arguments = listOf(
                navArgument("streamUrl") { type = NavType.StringType },
                navArgument("title") { type = NavType.StringType },
                navArgument("headers") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("contentId") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("contentType") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("contentName") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("poster") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("backdrop") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("logo") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("videoId") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("season") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("episode") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("episodeTitle") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                }
            )
        ) {
            PlayerScreen(
                onBackPress = { navController.popBackStack() }
            )
        }

        composable(Screen.Search.route) {
            SearchScreen(
                onNavigateToDetail = { itemId, itemType, addonBaseUrl ->
                    navController.navigate(Screen.Detail.createRoute(itemId, itemType, addonBaseUrl))
                }
            )
        }

        composable(Screen.Library.route) {
            LibraryScreen(
                onNavigateToDetail = { itemId, itemType, addonBaseUrl ->
                    navController.navigate(Screen.Detail.createRoute(itemId, itemType, addonBaseUrl))
                }
            )
        }

        composable(Screen.Settings.route) {
            SettingsScreen(
                onNavigateToPlugins = { navController.navigate(Screen.Plugins.route) },
                onNavigateToTmdb = { navController.navigate(Screen.TmdbSettings.route) }
            )
        }

        composable(Screen.TmdbSettings.route) {
            TmdbSettingsScreen(
                onBackPress = { navController.popBackStack() }
            )
        }

        composable(Screen.AddonManager.route) {
            AddonManagerScreen()
        }

        composable(Screen.Plugins.route) {
            PluginScreen(
                onBackPress = { navController.popBackStack() }
            )
        }
    }
}
