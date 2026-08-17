package com.nuvio.app.core.network

internal actual object ServerConfigurationStorage {
    actual fun loadCustom(): ServerConfiguration? = null
    actual fun saveCustom(configuration: ServerConfiguration): Boolean = false
    actual fun useOfficial(): Boolean = true
}
