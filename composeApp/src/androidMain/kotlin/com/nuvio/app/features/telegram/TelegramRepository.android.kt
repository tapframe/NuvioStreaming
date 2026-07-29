package com.nuvio.app.features.telegram

import android.content.Context
import co.touchlab.kermit.Logger
import kotlinx.coroutines.flow.StateFlow
import org.drinkless.tdlib.TdApi
import java.io.File

data class TelegramVideoMessage(
    val messageId: Long,
    val chatId: Long,
    val fileName: String,
    val fileId: Int,
    val fileSize: Long,
    val duration: Int,
    val mimeType: String,
    val caption: String
)

object TelegramRepository {
    private val log = Logger.withTag("TelegramRepository")
    private var appContext: Context? = null

    val authState: StateFlow<TelegramAuthState> get() = TelegramClient.authState

    fun initialize(context: Context) {
        appContext = context.applicationContext
        TelegramStreamingProxy.start()
        val hasSession = sessionMarker(context).exists()
        if (!hasSession) {
            File(context.filesDir, "tdlib").deleteRecursively()
            File(context.filesDir, "tdlib_files").deleteRecursively()
        } else {
            TelegramClient.initialize(context)
        }
    }

    private fun sessionMarker(context: Context) = File(context.filesDir, "tdlib_session_ok")

    fun isAuthenticated(): Boolean = TelegramClient.authState.value is TelegramAuthState.Ready

    fun startAuth() {
        appContext?.let { TelegramClient.initialize(it) }
    }

    fun requestQrCode() = TelegramClient.requestQrCode()
    fun submitPhone(phone: String) = TelegramClient.submitPhone(phone)
    fun submitCode(code: String) = TelegramClient.submitCode(code)
    fun submitPassword(password: String) = TelegramClient.submitPassword(password)

    fun disconnect() {
        TelegramClient.reset()
        appContext?.let { wipeTdlibFiles(it) }
    }

    private fun wipeTdlibFiles(context: Context) {
        sessionMarker(context).delete()
        File(context.filesDir, "tdlib").deleteRecursively()
        File(context.filesDir, "tdlib_files").deleteRecursively()
        log.d { "Wiped TDLib session and files" }
    }

    fun getCacheSize(): Long {
        val ctx = appContext ?: return 0L
        val dir = File(ctx.filesDir, "tdlib_files")
        return if (dir.exists()) dir.walkBottomUp().filter { it.isFile }.sumOf { it.length() } else 0L
    }

    fun clearCache() {
        val ctx = appContext ?: return
        File(ctx.filesDir, "tdlib_files").listFiles()?.forEach { it.deleteRecursively() }
    }

    suspend fun searchVideoMessages(
        query: String,
        limit: Int = 50
    ): List<TelegramVideoMessage> {
        if (!isAuthenticated()) return emptyList()

        val filters = listOf(
            TdApi.SearchMessagesFilterDocument(),
            TdApi.SearchMessagesFilterVideo()
        )
        val seen = mutableSetOf<Pair<String, Long>>()
        val results = mutableListOf<TelegramVideoMessage>()

        for (filter in filters) {
            val result = TelegramClient.sendRequest(TdApi.SearchMessages().also { req ->
                req.chatList = null
                req.query = query
                req.offset = ""
                req.limit = limit
                req.filter = filter
            })
            val found = (result as? TdApi.FoundMessages) ?: continue

            for (msg in found.messages) {
                when (val content = msg.content) {
                    is TdApi.MessageDocument -> {
                        val mime = content.document.mimeType
                        if (!mime.startsWith("video/") && mime != "application/x-matroska") continue
                        val key = content.document.fileName to content.document.document.size
                        if (seen.add(key)) {
                            results.add(
                                TelegramVideoMessage(
                                    messageId = msg.id,
                                    chatId = msg.chatId,
                                    fileName = content.document.fileName,
                                    fileId = content.document.document.id,
                                    fileSize = content.document.document.size,
                                    duration = 0,
                                    mimeType = mime,
                                    caption = content.caption.text
                                )
                            )
                        }
                    }
                    is TdApi.MessageVideo -> {
                        val key = content.video.fileName to content.video.video.size
                        if (seen.add(key)) {
                            results.add(
                                TelegramVideoMessage(
                                    messageId = msg.id,
                                    chatId = msg.chatId,
                                    fileName = content.video.fileName,
                                    fileId = content.video.video.id,
                                    fileSize = content.video.video.size,
                                    duration = content.video.duration,
                                    mimeType = content.video.mimeType,
                                    caption = content.caption.text
                                )
                            )
                        }
                    }
                    else -> continue
                }
            }
        }

        return results
    }

    fun getStreamUrl(fileId: Int): String = TelegramStreamingProxy.getUrl(fileId)
}
