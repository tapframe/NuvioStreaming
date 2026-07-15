package com.nuvio.app.features.livetv

import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import kotlinx.cinterop.ExperimentalForeignApi
import platform.Foundation.NSURL
import platform.UIKit.UIApplication
import platform.UIKit.UIDocumentPickerDelegateProtocol
import platform.UIKit.UIDocumentPickerMode
import platform.UIKit.UIDocumentPickerViewController
import platform.UIKit.UIViewController
import platform.darwin.NSObject

@Composable
internal actual fun rememberLiveTvPlaylistFilePicker(
    onPlaylistLoaded: (fileName: String?, content: String) -> Unit,
    onError: (String) -> Unit,
): LiveTvPlaylistFilePicker {
    val delegateHolder = remember { mutableStateOf<LiveTvPlaylistDocumentPickerDelegate?>(null) }

    return LiveTvPlaylistFilePicker(canPickFiles = true) {
        val presenter = topViewController()
        if (presenter == null) {
            onError("Unable to present file picker.")
            return@LiveTvPlaylistFilePicker
        }

        val picker = UIDocumentPickerViewController(
            documentTypes = listOf(
                "public.m3u-playlist",
                "public.mpegurl",
                "public.text",
                "public.data",
            ),
            inMode = UIDocumentPickerMode.UIDocumentPickerModeImport,
        )
        val delegate = LiveTvPlaylistDocumentPickerDelegate(
            onPicked = { url ->
                val didStartAccess = url.startAccessingSecurityScopedResource()
                try {
                    val path = url.path
                    if (path.isNullOrBlank()) {
                        onError("Unable to resolve selected M3U file path.")
                    } else {
                        val content = readUtf8File(path)
                        onPlaylistLoaded(url.lastPathComponent, content)
                    }
                } catch (error: Throwable) {
                    onError(error.message ?: "Failed to read M3U file.")
                } finally {
                    if (didStartAccess) {
                        url.stopAccessingSecurityScopedResource()
                    }
                    delegateHolder.value = null
                }
            },
            onDismissed = {
                delegateHolder.value = null
            },
        )
        delegateHolder.value = delegate
        picker.delegate = delegate
        presenter.presentViewController(picker, animated = true, completion = null)
    }
}

@OptIn(ExperimentalForeignApi::class)
private fun readUtf8File(path: String): String {
    val file = platform.posix.fopen(path, "rb")
        ?: error("Unable to open selected M3U file.")

    return try {
        val bytes = mutableListOf<Byte>()
        while (true) {
            val value = platform.posix.fgetc(file)
            if (value < 0) break
            bytes += value.toByte()
        }
        bytes.toByteArray().decodeToString().removePrefix("\uFEFF")
    } finally {
        platform.posix.fclose(file)
    }
}

private class LiveTvPlaylistDocumentPickerDelegate(
    private val onPicked: (NSURL) -> Unit,
    private val onDismissed: () -> Unit,
) : NSObject(), UIDocumentPickerDelegateProtocol {
    override fun documentPicker(
        controller: UIDocumentPickerViewController,
        didPickDocumentsAtURLs: List<*>,
    ) {
        val url = didPickDocumentsAtURLs.firstOrNull() as? NSURL
        if (url != null) {
            onPicked(url)
        } else {
            onDismissed()
        }
    }

    override fun documentPickerWasCancelled(controller: UIDocumentPickerViewController) {
        onDismissed()
    }
}

private fun topViewController(): UIViewController? {
    var controller = UIApplication.sharedApplication.keyWindow?.rootViewController
    while (controller?.presentedViewController != null) {
        controller = controller.presentedViewController
    }
    return controller
}
