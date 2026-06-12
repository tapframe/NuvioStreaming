package com.nuvio.app.core.build

actual object AppVersionPolicy {
    actual val displayVersionName: String = AppVersionConfig.VERSION_NAME
    actual val displayVersionCode: Int = AppVersionConfig.VERSION_CODE
    actual val basedOnVersionName: String? = null
}
