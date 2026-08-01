package com.nuvio.app.features.simkl

internal data class SimklPkceMaterial(
    val verifier: String,
    val challenge: String,
    val state: String,
)

internal fun generateSimklPkceMaterial(): SimklPkceMaterial =
    createSimklPkceMaterial(
        verifierEntropy = SimklPkceCrypto.secureRandomBytes(32),
        stateEntropy = SimklPkceCrypto.secureRandomBytes(32),
    )

internal fun createSimklPkceMaterial(
    verifierEntropy: ByteArray,
    stateEntropy: ByteArray,
): SimklPkceMaterial {
    require(verifierEntropy.size >= 32) { "PKCE verifier entropy must be at least 32 bytes" }
    require(stateEntropy.size >= 16) { "OAuth state entropy must be at least 16 bytes" }
    val verifier = verifierEntropy.base64UrlWithoutPadding()
    require(verifier.length in 43..128) { "PKCE verifier must be 43-128 characters" }
    return SimklPkceMaterial(
        verifier = verifier,
        challenge = SimklPkceCrypto.sha256(verifier.encodeToByteArray()).base64UrlWithoutPadding(),
        state = stateEntropy.base64UrlWithoutPadding(),
    )
}

internal fun ByteArray.base64UrlWithoutPadding(): String {
    if (isEmpty()) return ""
    val alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    return buildString((size * 4 + 2) / 3) {
        var index = 0
        while (index < size) {
            val first = this@base64UrlWithoutPadding[index].toInt() and 0xff
            val second = this@base64UrlWithoutPadding.getOrNull(index + 1)?.toInt()?.and(0xff)
            val third = this@base64UrlWithoutPadding.getOrNull(index + 2)?.toInt()?.and(0xff)

            append(alphabet[first ushr 2])
            append(alphabet[((first and 0x03) shl 4) or ((second ?: 0) ushr 4)])
            if (second != null) {
                append(alphabet[((second and 0x0f) shl 2) or ((third ?: 0) ushr 6)])
            }
            if (third != null) {
                append(alphabet[third and 0x3f])
            }
            index += 3
        }
    }
}
