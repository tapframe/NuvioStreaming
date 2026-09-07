package com.nuvio.app.features.membership

import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.convert
import kotlinx.cinterop.usePinned
import platform.Foundation.NSFileManager
import platform.Foundation.NSHomeDirectory
import platform.Foundation.NSUserDefaults
import platform.Foundation.NSURL
import platform.posix.SEEK_END
import platform.posix.fclose
import platform.posix.fopen
import platform.posix.fread
import platform.posix.fseek
import platform.posix.ftell
import platform.posix.fwrite
import platform.posix.rewind

@OptIn(ExperimentalForeignApi::class)
internal actual object MemberAssetStorage {
    private const val accessPayloadKey = "member_access_payload"
    private const val backgroundCatalogPayloadKey = "member_background_catalog_payload"
    private val backgroundDirectory = "${NSHomeDirectory()}/Library/Caches/NuvioMemberBackgrounds"
    private val avatarDirectory = "${NSHomeDirectory()}/Library/Caches/NuvioMemberAvatars"
    private val legacyBrandingPath = "${NSHomeDirectory()}/Library/Application Support/NuvioMembership/branding.png"

    actual fun loadAccessPayload(): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(accessPayloadKey)

    actual fun saveAccessPayload(payload: String) {
        NSUserDefaults.standardUserDefaults.setObject(payload, forKey = accessPayloadKey)
        NSFileManager.defaultManager.removeItemAtPath(legacyBrandingPath, null)
    }

    actual fun loadProfileBackgroundCatalogPayload(): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(backgroundCatalogPayloadKey)

    actual fun saveProfileBackgroundCatalogPayload(payload: String) {
        NSUserDefaults.standardUserDefaults.setObject(payload, forKey = backgroundCatalogPayloadKey)
    }

    actual fun loadProfileBackground(cacheKey: String): ByteArray? =
        readFile("$backgroundDirectory/${safeKey(cacheKey)}.png")

    actual fun saveProfileBackground(cacheKey: String, bytes: ByteArray) {
        writeFile(backgroundDirectory, "$backgroundDirectory/${safeKey(cacheKey)}.png", bytes)
    }

    actual fun loadProfileAvatar(cacheKey: String): String? {
        val path = "$avatarDirectory/${safeKey(cacheKey)}"
        return if (fileExists(path)) fileUrl(path) else null
    }

    actual fun saveProfileAvatar(cacheKey: String, bytes: ByteArray): String? {
        val path = "$avatarDirectory/${safeKey(cacheKey)}"
        return if (writeFile(avatarDirectory, path, bytes)) fileUrl(path) else null
    }

    actual fun clearAccess() {
        NSUserDefaults.standardUserDefaults.removeObjectForKey(accessPayloadKey)
        NSFileManager.defaultManager.removeItemAtPath(legacyBrandingPath, null)
    }

    private fun writeFile(directory: String, path: String, bytes: ByteArray): Boolean {
        NSFileManager.defaultManager.createDirectoryAtPath(
            path = directory,
            withIntermediateDirectories = true,
            attributes = null,
            error = null,
        )
        return bytes.writeToFile(path)
    }

    private fun ByteArray.writeToFile(path: String): Boolean {
        val file = fopen(path, "wb") ?: return false
        return try {
            if (isEmpty()) return true
            usePinned { pinned ->
                fwrite(pinned.addressOf(0), 1.convert(), size.convert(), file).toLong() == size.toLong()
            }
        } finally {
            fclose(file)
        }
    }

    private fun readFile(path: String): ByteArray? {
        val file = fopen(path, "rb") ?: return null
        return try {
            if (fseek(file, 0, SEEK_END) != 0) return null
            val size = ftell(file)
            if (size <= 0L || size > Int.MAX_VALUE) return null
            rewind(file)
            ByteArray(size.toInt()).also { result ->
                val read = result.usePinned { pinned ->
                    fread(pinned.addressOf(0), 1.convert(), result.size.convert(), file)
                }
                if (read.toLong() != result.size.toLong()) return null
            }
        } finally {
            fclose(file)
        }
    }

    private fun fileExists(path: String): Boolean =
        NSFileManager.defaultManager.fileExistsAtPath(path)

    private fun fileUrl(path: String): String =
        NSURL.fileURLWithPath(path).absoluteString ?: "file://$path"

    private fun safeKey(value: String): String = value.map { character ->
        if (character.isLetterOrDigit() || character == '.' || character == '_' || character == '-') character else '_'
    }.joinToString("")
}
