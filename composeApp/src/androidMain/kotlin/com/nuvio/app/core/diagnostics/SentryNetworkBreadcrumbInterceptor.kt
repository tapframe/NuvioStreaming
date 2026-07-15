package com.nuvio.app.core.diagnostics

import io.sentry.Breadcrumb
import io.sentry.Sentry
import io.sentry.SentryLevel
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException

class SentryNetworkBreadcrumbInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (!Sentry.isEnabled()) return chain.proceed(request)

        val startedAtNs = System.nanoTime()
        try {
            val response = chain.proceed(request)
            record(
                url = request.url,
                method = request.method,
                statusCode = response.code,
                elapsedMs = elapsedMs(startedAtNs),
                error = null,
            )
            return response
        } catch (error: IOException) {
            record(
                url = request.url,
                method = request.method,
                statusCode = null,
                elapsedMs = elapsedMs(startedAtNs),
                error = error,
            )
            throw error
        } catch (error: RuntimeException) {
            record(
                url = request.url,
                method = request.method,
                statusCode = null,
                elapsedMs = elapsedMs(startedAtNs),
                error = error,
            )
            throw error
        }
    }

    private fun record(
        url: HttpUrl,
        method: String,
        statusCode: Int?,
        elapsedMs: Long,
        error: Throwable?,
    ) {
        val breadcrumb = if (statusCode == null) {
            Breadcrumb.http(scrubbedUrl(url), method)
        } else {
            Breadcrumb.http(scrubbedUrl(url), method, statusCode)
        }
        breadcrumb.setCategory("http.client")
        breadcrumb.setLevel(levelFor(statusCode, error))
        breadcrumb.setData("host", url.host)
        breadcrumb.setData("path", url.encodedPath)
        breadcrumb.setData("elapsed_ms", elapsedMs)
        if (error != null) {
            breadcrumb.setData("error_type", error.javaClass.name)
            error.message?.let { breadcrumb.setData("error_message", it.take(240)) }
        }
        Sentry.addBreadcrumb(breadcrumb)
    }

    private fun levelFor(statusCode: Int?, error: Throwable?): SentryLevel {
        if (error != null) return SentryLevel.ERROR
        val code = statusCode ?: return SentryLevel.INFO
        return when {
            code >= 500 -> SentryLevel.ERROR
            code >= 400 -> SentryLevel.WARNING
            else -> SentryLevel.INFO
        }
    }

    private fun scrubbedUrl(url: HttpUrl): String =
        url.newBuilder()
            .query(null)
            .fragment(null)
            .build()
            .toString()

    private fun elapsedMs(startedAtNs: Long): Long =
        (System.nanoTime() - startedAtNs) / 1_000_000L
}
