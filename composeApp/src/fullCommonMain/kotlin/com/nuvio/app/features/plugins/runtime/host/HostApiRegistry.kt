package com.nuvio.app.features.plugins.runtime.host

import com.dokar.quickjs.QuickJs

internal interface HostModule {
    fun register(runtime: QuickJs)
}

internal class HostApiRegistry {
    private val modules = mutableListOf<HostModule>()

    fun addModule(module: HostModule) {
        modules.add(module)
    }

    fun registerAll(runtime: QuickJs) {
        modules.forEach { it.register(runtime) }
    }
}
