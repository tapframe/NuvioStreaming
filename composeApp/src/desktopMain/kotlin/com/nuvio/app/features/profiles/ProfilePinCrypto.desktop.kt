package com.nuvio.app.features.profiles

import java.security.MessageDigest

internal actual object ProfilePinCrypto {
    actual fun sha256Hex(value: String): String =
        MessageDigest
            .getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte) }
}
