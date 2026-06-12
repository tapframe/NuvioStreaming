package com.nuvio.app.core.build

actual object AppVersionPolicy {
    actual val displayVersionName: String = AppVersionConfig.DESKTOP_VERSION_NAME
    actual val displayVersionCode: Int = AppVersionConfig.DESKTOP_VERSION_CODE
    actual val basedOnVersionName: String? = AppVersionConfig.VERSION_NAME.takeIf { it != displayVersionName }
}
