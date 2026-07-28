package com.nuvio.app.features.library.sync

import com.nuvio.app.features.library.LibraryItem
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LibrarySyncKey(
    @SerialName("content_id") val contentId: String,
    @SerialName("content_type") val contentType: String,
)

data class LibraryDeltaEvent(
    val eventId: Long,
    val operation: String,
    val item: LibraryItem,
)

interface LibrarySyncAdapter {
    suspend fun pullSnapshot(
        profileId: Int,
        pageSize: Int,
    ): List<LibraryItem>

    suspend fun getDeltaCursor(profileId: Int): Long

    suspend fun pullDelta(
        profileId: Int,
        sinceEventId: Long,
        limit: Int,
    ): List<LibraryDeltaEvent>

    suspend fun pushItems(
        profileId: Int,
        items: Collection<LibraryItem>,
    )

    suspend fun deleteItems(
        profileId: Int,
        keys: Collection<LibrarySyncKey>,
    )
}

fun LibraryItem.toLibrarySyncKey(): LibrarySyncKey =
    LibrarySyncKey(
        contentId = id,
        contentType = type,
    )
