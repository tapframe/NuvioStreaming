package com.nuvio.tv.ui.screens.home

/**
 * Stores focus and scroll state for the HomeScreen to enable proper state restoration
 * when navigating back from detail screens.
 */
data class HomeScreenFocusState(
    /**
     * The index of the first visible item in the main vertical LazyColumn.
     */
    val verticalScrollIndex: Int = 0,

    /**
     * The pixel offset of the first visible item in the vertical scroll.
     */
    val verticalScrollOffset: Int = 0,

    /**
     * Index of the catalog row that had focus when navigating away.
     */
    val focusedRowIndex: Int = 0,

    /**
     * Index of the item within the focused catalog row.
     */
    val focusedItemIndex: Int = 0,

    /**
     * Map of catalog row keys to their horizontal scroll positions.
     * Key format: "${addonId}_${type}_${catalogId}"
     */
    val catalogRowScrollStates: Map<String, Int> = emptyMap()
)
