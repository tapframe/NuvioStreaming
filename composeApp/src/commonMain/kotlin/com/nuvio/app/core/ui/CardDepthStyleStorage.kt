package com.nuvio.app.core.ui

internal expect object CardDepthStyleStorage {
    fun loadPayload(): String?
    fun savePayload(payload: String)
}
