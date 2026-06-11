package com.nuvio.app.features.player.sponsorblock

import java.security.MessageDigest

internal actual fun platformSha256(input: String): String {
    val digest = MessageDigest.getInstance("SHA-256")
    val hashBytes = digest.digest(input.toByteArray(Charsets.UTF_8))
    return hashBytes.joinToString("") { "%02x".format(it) }
}
