package com.nuvio.app.features.settings

internal expect object AppIconPlatform {
    val requiresCloseConfirmation: Boolean
    fun currentIconName(): String?
    suspend fun activateIcon(name: String?): Boolean
}
