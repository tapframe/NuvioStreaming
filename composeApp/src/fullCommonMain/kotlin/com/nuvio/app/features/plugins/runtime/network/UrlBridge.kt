package com.nuvio.app.features.plugins.runtime.network

import com.dokar.quickjs.QuickJs
import com.dokar.quickjs.binding.function
import com.nuvio.app.features.plugins.runtime.host.HostModule
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

internal class UrlBridge : HostModule {
    override fun register(runtime: QuickJs) {
        runtime.function("__parse_url") { args ->
            val urlString = args.getOrNull(0)?.toString() ?: ""
            parseUrl(urlString)
        }
    }

    private fun parseUrl(urlString: String): String {
        return try {
            val parsed = io.ktor.http.Url(urlString)
            JsonObject(
                mapOf(
                    "protocol" to JsonPrimitive("${parsed.protocol.name}:"),
                    "host" to JsonPrimitive(
                        if (parsed.port != parsed.protocol.defaultPort) {
                            "${parsed.host}:${parsed.port}"
                        } else {
                            parsed.host
                        },
                    ),
                    "hostname" to JsonPrimitive(parsed.host),
                    "port" to JsonPrimitive(
                        if (parsed.port != parsed.protocol.defaultPort) parsed.port.toString() else "",
                    ),
                    "pathname" to JsonPrimitive(parsed.encodedPath.ifBlank { "/" }),
                    "search" to JsonPrimitive(parsed.encodedQuery?.let { "?$it" } ?: ""),
                    "hash" to JsonPrimitive(parsed.encodedFragment?.let { "#$it" } ?: ""),
                ),
            ).toString()
        } catch (_: Exception) {
            JsonObject(
                mapOf(
                    "protocol" to JsonPrimitive(""),
                    "host" to JsonPrimitive(""),
                    "hostname" to JsonPrimitive(""),
                    "port" to JsonPrimitive(""),
                    "pathname" to JsonPrimitive("/"),
                    "search" to JsonPrimitive(""),
                    "hash" to JsonPrimitive(""),
                ),
            ).toString()
        }
    }
}
