package com.nuvio.app.features.plugins.runtime.js

import com.dokar.quickjs.QuickJs
import com.dokar.quickjs.quickJs
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers

internal class JsRuntime(
    private val dispatcher: CoroutineDispatcher = Dispatchers.Default
) {
    suspend fun <T> use(block: suspend QuickJs.() -> T): T {
        return quickJs(dispatcher) {
            block()
        }
    }
}
