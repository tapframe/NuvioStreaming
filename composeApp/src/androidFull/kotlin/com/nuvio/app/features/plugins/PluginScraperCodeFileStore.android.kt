package com.nuvio.app.features.plugins

import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import java.io.File

internal class PluginScraperCodeFileStore(
    private val root: File,
) {
    private val lock = SynchronizedObject()

    fun contains(profileId: Int, scraperId: String): Boolean =
        scraperCodeFile(profileId, scraperId).isFile

    fun load(profileId: Int, scraperId: String): String? = synchronized(lock) {
        val file = scraperCodeFile(profileId, scraperId).takeIf(File::isFile)
            ?: return@synchronized null
        runCatching { file.readText() }.getOrNull()
    }

    fun save(
        profileId: Int,
        scraperId: String,
        code: String,
        overwrite: Boolean,
    ): Boolean {
        val target = scraperCodeFile(profileId, scraperId)
        if (!overwrite && target.isFile) return true
        return synchronized(lock) {
            if (!overwrite && target.isFile) return@synchronized true
            val directory = target.parentFile ?: return@synchronized false
            if (!directory.exists() && !directory.mkdirs()) return@synchronized false

            val temporary = runCatching {
                File.createTempFile("scraper-", ".tmp", directory)
            }.getOrNull() ?: return@synchronized false
            val backup = directory.resolve("${target.name}.backup")

            try {
                temporary.bufferedWriter().use { writer -> writer.write(code) }
                if (!overwrite && target.isFile) return@synchronized true
                if (backup.exists() && !backup.delete()) return@synchronized false
                val hadTarget = target.exists()
                if (hadTarget && !target.renameTo(backup)) return@synchronized false
                if (!temporary.renameTo(target)) {
                    if (hadTarget) backup.renameTo(target)
                    return@synchronized false
                }
                if (backup.exists()) backup.delete()
                true
            } catch (_: Throwable) {
                false
            } finally {
                if (temporary.exists()) temporary.delete()
                if (backup.exists() && !target.exists()) backup.renameTo(target)
            }
        }
    }

    private fun scraperCodeFile(profileId: Int, scraperId: String): File {
        val fileName = "${pluginDigestHex("SHA256", scraperId)}.js"
        return root.resolve(profileId.toString()).resolve(fileName)
    }
}
