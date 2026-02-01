package com.nuvio.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.background
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.res.painterResource
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.rememberNavController
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.DrawerValue
import androidx.tv.material3.Icon
import androidx.tv.material3.NavigationDrawer
import androidx.tv.material3.NavigationDrawerItem
import androidx.tv.material3.Text
import androidx.tv.material3.rememberDrawerState
import androidx.tv.material3.Surface
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Extension
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import coil.compose.AsyncImage
import com.nuvio.tv.ui.navigation.NuvioNavHost
import com.nuvio.tv.ui.navigation.Screen
import com.nuvio.tv.ui.theme.NuvioTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @OptIn(ExperimentalTvMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            NuvioTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    shape = RectangleShape
                ) {
                    val navController = rememberNavController()
                    val navBackStackEntry by navController.currentBackStackEntryAsState()
                    val currentRoute = navBackStackEntry?.destination?.route
                    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)

                    val rootRoutes = setOf(
                        Screen.Home.route,
                        Screen.Search.route,
                        Screen.Library.route,
                        Screen.Settings.route,
                        Screen.AddonManager.route
                    )

                    LaunchedEffect(currentRoute) {
                        if (currentRoute in rootRoutes) {
                            drawerState.setValue(DrawerValue.Closed)
                        } else {
                            drawerState.setValue(DrawerValue.Closed)
                        }
                    }

                    BackHandler(enabled = currentRoute in rootRoutes && drawerState.currentValue == DrawerValue.Closed) {
                        drawerState.setValue(DrawerValue.Open)
                    }

                    val drawerItems = listOf(
                        Screen.Home.route to ("Home" to Icons.Filled.Home),
                        Screen.Search.route to ("Search" to Icons.Filled.Search),
                        Screen.Library.route to ("Library" to Icons.Filled.Bookmark),
                        Screen.AddonManager.route to ("Addons" to Icons.Filled.Extension),
                        Screen.Settings.route to ("Settings" to Icons.Filled.Settings)
                    )

                    val showSidebar = currentRoute in rootRoutes
                    if (showSidebar) {
                        NavigationDrawer(
                            drawerState = drawerState,
                            drawerContent = { drawerValue ->
                                val drawerWidth = if (drawerValue == DrawerValue.Open) 260.dp else 72.dp
                                Column(
                                    modifier = Modifier
                                        .fillMaxHeight()
                                        .width(drawerWidth)
                                        .background(
                                            Brush.horizontalGradient(
                                                colors = listOf(
                                                    Color.Black.copy(alpha = 0.7f),
                                                    Color.Black.copy(alpha = 0.35f),
                                                    Color.Transparent
                                                )
                                            )
                                        )
                                        .padding(12.dp)
                                        .selectableGroup(),
                                    verticalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    if (drawerValue == DrawerValue.Open) {
                                        Image(
                                            painter = painterResource(id = R.drawable.nuvio_text),
                                            contentDescription = "Nuvio",
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(48.dp),
                                            contentScale = ContentScale.Fit
                                        )
                                    } else {
                                        Image(
                                            painter = painterResource(id = R.drawable.nuvio_n),
                                            contentDescription = "Nuvio",
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(48.dp),
                                            contentScale = ContentScale.Fit
                                        )
                                    }
                                    drawerItems.forEach { (route, item) ->
                                        val (label, icon) = item
                                        NavigationDrawerItem(
                                            selected = currentRoute == route,
                                            onClick = {
                                                if (currentRoute != route) {
                                                    navController.navigate(route) {
                                                        popUpTo(navController.graph.startDestinationId) {
                                                            saveState = true
                                                        }
                                                        launchSingleTop = true
                                                        restoreState = true
                                                    }
                                                }
                                                drawerState.setValue(DrawerValue.Closed)
                                            },
                                            leadingContent = {
                                                Icon(imageVector = icon, contentDescription = null)
                                            }
                                        ) {
                                            if (drawerValue == DrawerValue.Open) {
                                                Text(label)
                                            }
                                        }
                                    }
                                }
                            }
                        ) {
                            Box(modifier = Modifier.fillMaxSize()) {
                                NuvioNavHost(navController = navController)
                            }
                        }
                    } else {
                        Box(modifier = Modifier.fillMaxSize()) {
                            NuvioNavHost(navController = navController)
                        }
                    }
                }
            }
        }
    }
}
