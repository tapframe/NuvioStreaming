package com.nuvio.app.features.plugins

import java.security.MessageDigest
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

internal fun pluginDigestHex(algorithm: String, data: String): String {
    val normalized = algorithm.uppercase()
    val digest = MessageDigest.getInstance(normalized).digest(data.encodeToByteArray())
    return digest.joinToString(separator = "") { byte ->
        byte.toUByte().toString(16).padStart(2, '0')
    }
}

internal fun pluginHmacHex(algorithm: String, key: String, data: String): String {
    val normalized = when (algorithm.uppercase()) {
        "SHA1" -> "HmacSHA1"
        "SHA256" -> "HmacSHA256"
        "SHA512" -> "HmacSHA512"
        "MD5" -> "HmacMD5"
        else -> error("Unsupported HMAC algorithm: $algorithm")
    }
    val mac = Mac.getInstance(normalized)
    mac.init(SecretKeySpec(key.encodeToByteArray(), normalized))
    val digest = mac.doFinal(data.encodeToByteArray())
    return digest.joinToString(separator = "") { byte ->
        byte.toUByte().toString(16).padStart(2, '0')
    }
}

internal fun pluginBase64Encode(data: String): String =
    Base64.getEncoder().encodeToString(data.encodeToByteArray())

internal fun pluginBase64Decode(data: String): String {
    val normalized = data.trim().replace("\n", "").replace("\r", "").replace(" ", "")
    val decoded = Base64.getDecoder().decode(normalized)
    return decoded.decodeToString()
}

internal fun pluginUtf8ToHex(value: String): String =
    value.encodeToByteArray().joinToString(separator = "") { byte ->
        byte.toUByte().toString(16).padStart(2, '0')
    }

internal fun pluginHexToUtf8(hex: String): String {
    val normalized = hex.trim().lowercase()
        .replace(" ", "")
        .removePrefix("0x")
    if (normalized.isEmpty()) return ""

    val evenHex = if (normalized.length % 2 == 0) normalized else "0$normalized"
    val out = ByteArray(evenHex.length / 2)
    for (index in out.indices) {
        val part = evenHex.substring(index * 2, index * 2 + 2)
        out[index] = part.toInt(16).toByte()
    }
    return out.decodeToString()
}
