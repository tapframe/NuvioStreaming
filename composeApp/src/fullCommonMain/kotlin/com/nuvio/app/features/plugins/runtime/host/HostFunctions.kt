package com.nuvio.app.features.plugins.runtime.host

import co.touchlab.kermit.Logger
import com.dokar.quickjs.QuickJs
import com.dokar.quickjs.binding.define
import com.dokar.quickjs.binding.function

internal class HostFunctions(
    private val scraperId: String,
    private val onResult: (String) -> Unit
) : HostModule {
    private val log = Logger.withTag("PluginRuntime")

    override fun register(runtime: QuickJs) {
        runtime.define("console") {
            function("log") { args ->
                log.d { "Plugin:$scraperId ${args.joinToString(" ") { it?.toString() ?: "null" }}" }
                null
            }
            function("error") { args ->
                log.e { "Plugin:$scraperId ${args.joinToString(" ") { it?.toString() ?: "null" }}" }
                null
            }
            function("warn") { args ->
                log.w { "Plugin:$scraperId ${args.joinToString(" ") { it?.toString() ?: "null" }}" }
                null
            }
            function("info") { args ->
                log.i { "Plugin:$scraperId ${args.joinToString(" ") { it?.toString() ?: "null" }}" }
                null
            }
            function("debug") { args ->
                log.d { "Plugin:$scraperId ${args.joinToString(" ") { it?.toString() ?: "null" }}" }
                null
            }
        }

        runtime.function("__capture_result") { args ->
            onResult(args.getOrNull(0)?.toString() ?: "[]")
            null
        }
    }
}
