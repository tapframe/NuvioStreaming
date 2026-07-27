package com.nuvio.app.core.auth

import android.os.Build

internal actual fun currentDeviceClientMetadata(): DeviceClientMetadata {
    val deviceName = formatDeviceName(
        manufacturer = Build.MANUFACTURER.orEmpty(),
        model = Build.MODEL.orEmpty(),
        fallback = "Android device",
    )
    val osVersion = Build.VERSION.RELEASE.orEmpty()
        .trim()
        .ifBlank { Build.VERSION.SDK_INT.toString() }

    return DeviceClientMetadata(
        deviceName = deviceName,
        platform = "Android $osVersion",
    )
}
