package com.nuvio.app.features.plugins.runtime.network

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.net.http.SslError
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import co.touchlab.kermit.Logger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

internal fun platformWebViewSolverImpl(): WebViewSolver = AndroidWebViewSolver

internal object AndroidWebViewSolver : WebViewSolver {
    private val log = Logger.withTag("AndroidWebViewSolver")

    @Volatile
    private var appContext: Context? = null

    private val blockedPathSuffixes = listOf(
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".mpg",
        ".mpeg",
        ".mp4",
        ".webm",
        ".gifv",
        ".flv",
        ".asf",
        ".mov",
        ".mng",
        ".mkv",
        ".ogg",
        ".avi",
        ".mp3",
        ".wav",
        ".woff2",
        ".woff",
        ".ttf",
        ".css",
        ".vtt",
        ".srt",
        ".ts",
        ".gif",
    )

    fun initialize(context: Context) {
        appContext = context.applicationContext
    }

    @SuppressLint("SetJavaScriptEnabled")
    override suspend fun solve(
        url: String,
        headers: Map<String, String>,
        forceFresh: Boolean,
        timeoutMs: Long,
    ): CfSolveResult? {
        val context = appContext ?: run {
            log.e { "AndroidWebViewSolver is not initialized" }
            return null
        }

        val host = extractHost(url)
        val cookieManager = CookieManager.getInstance()
        withContext(Dispatchers.Main) {
            cookieManager.setAcceptCookie(true)
        }

        if (!forceFresh) {
            val existing = withContext(Dispatchers.Main) {
                runCatching { cookieManager.getCookie(url) }.getOrNull()
            }
            if (existing?.contains("cf_clearance") == true) {
                return CfSolveResult(
                    cookies = parseCookieString(existing),
                    userAgent = captureUserAgent(context),
                )
            }
        }

        runCatching { clearCookiesForUrl(url) }

        var webViewRef: WebView? = null
        var webViewUserAgent = ""
        val finalUrlRef = java.util.concurrent.atomic.AtomicReference(url)

        try {
            withContext(Dispatchers.Main) {
                val webView = WebView(context).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    webViewUserAgent = settings.userAgentString

                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

                    webViewClient = object : WebViewClient() {
                        override fun onPageStarted(
                            view: WebView?,
                            pageUrl: String?,
                            favicon: android.graphics.Bitmap?,
                        ) {
                            if (pageUrl != null && !pageUrl.contains("challenges.cloudflare.com")) {
                                finalUrlRef.set(pageUrl)
                            }
                            super.onPageStarted(view, pageUrl, favicon)
                        }

                        override fun onPageFinished(view: WebView?, pageUrl: String?) {
                            if (pageUrl != null && !pageUrl.contains("challenges.cloudflare.com")) {
                                finalUrlRef.set(pageUrl)
                            }
                            super.onPageFinished(view, pageUrl)
                        }

                        override fun shouldInterceptRequest(
                            view: WebView,
                            request: WebResourceRequest,
                        ): WebResourceResponse? {
                            val requestUrl = request.url.toString()

                            if (requestUrl.contains("recaptcha") || requestUrl.contains("/cdn-cgi/")) {
                                return super.shouldInterceptRequest(view, request)
                            }

                            if (requestUrl.endsWith("/favicon.ico") || requestUrl.startsWith("wss://")) {
                                return WebResourceResponse("text/plain", "utf-8", null)
                            }

                            val path = runCatching { Uri.parse(requestUrl).path.orEmpty() }.getOrDefault("")
                            if (blockedPathSuffixes.any { path.contains(it, ignoreCase = true) }) {
                                return WebResourceResponse("text/plain", "utf-8", null)
                            }

                            return super.shouldInterceptRequest(view, request)
                        }

                        @SuppressLint("WebViewClientOnReceivedSslError")
                        override fun onReceivedSslError(
                            view: WebView?,
                            handler: SslErrorHandler?,
                            error: SslError?,
                        ) {
                            handler?.proceed()
                        }
                    }
                }
                webViewRef = webView
                webView.loadUrl(url, headers)
            }

            val result = withTimeoutOrNull(timeoutMs) {
                var solved: CfSolveResult? = null
                while (solved == null) {
                    delay(100L)
                    val currentUrl = finalUrlRef.get()
                    val raw = runCatching {
                        cookieManager.getCookie(currentUrl) ?: cookieManager.getCookie(url)
                    }.getOrNull()

                    if (raw?.contains("cf_clearance") == true) {
                        delay(500L)
                        val finalUrl = finalUrlRef.get()
                        val finalRaw = runCatching {
                            cookieManager.getCookie(finalUrl) ?: cookieManager.getCookie(url)
                        }.getOrNull() ?: raw
                        solved = CfSolveResult(
                            cookies = parseCookieString(finalRaw),
                            userAgent = webViewUserAgent,
                            redirectUrl = finalUrl.takeIf { it != url },
                        )
                    }
                }
                solved
            }

            if (result == null) {
                log.w { "CF solve timed out after ${timeoutMs}ms for $host" }
            }
            return result
        } finally {
            withContext(NonCancellable + Dispatchers.Main) {
                webViewRef?.stopLoading()
                webViewRef?.destroy()
                webViewRef = null
            }
        }
    }

    private suspend fun clearCookiesForUrl(url: String) = withContext(Dispatchers.Main) {
        val cookieString = CookieManager.getInstance().getCookie(url).orEmpty()
        if (cookieString.isBlank()) return@withContext

        val host = Uri.parse(url).host ?: return@withContext
        val rootDomain = host.split(".").takeIf { it.size > 2 }
            ?.takeLast(2)
            ?.joinToString(separator = ".", prefix = ".")
        val cookieNames = parseCookieString(cookieString).keys

        cookieNames.forEach { name ->
            expireCookie(url, "$name=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Domain=$host")
            if (rootDomain != null) {
                expireCookie(url, "$name=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Domain=$rootDomain")
            }
        }
        CookieManager.getInstance().flush()
    }

    private suspend fun expireCookie(url: String, value: String) = suspendCoroutine<Unit> { cont ->
        CookieManager.getInstance().setCookie(url, value) {
            cont.resume(Unit)
        }
    }

    private suspend fun captureUserAgent(context: Context): String = withContext(Dispatchers.Main) {
        val webView = WebView(context)
        val userAgent = webView.settings.userAgentString
        webView.destroy()
        userAgent
    }
}
