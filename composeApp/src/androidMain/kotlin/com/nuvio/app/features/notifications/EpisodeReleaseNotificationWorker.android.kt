package com.nuvio.app.features.notifications

import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlin.math.abs

class EpisodeReleaseNotificationWorker(
    appContext: android.content.Context,
    workerParameters: WorkerParameters,
) : CoroutineWorker(appContext, workerParameters) {

    override suspend fun doWork(): Result {
        if (!EpisodeReleaseNotificationPlatform.notificationsAuthorized()) {
            return Result.success()
        }

        val requestId = inputData.getString(EpisodeReleaseNotificationPlatform.workerRequestIdKey)
            ?: return Result.failure()
        val title = inputData.getString(EpisodeReleaseNotificationPlatform.workerTitleKey)
            ?: return Result.failure()
        val body = inputData.getString(EpisodeReleaseNotificationPlatform.workerBodyKey)
            ?: return Result.failure()
        val deepLink = inputData.getString(EpisodeReleaseNotificationPlatform.workerDeepLinkKey)
            ?: return Result.failure()
        val backdropUrl = inputData.getString(EpisodeReleaseNotificationPlatform.workerBackdropUrlKey)

        val request = EpisodeReleaseNotificationRequest(
            requestId = requestId,
            notificationTitle = title,
            notificationBody = body,
            releaseDateIso = "",
            deepLinkUrl = deepLink,
            backdropUrl = backdropUrl,
        )

        val notification = EpisodeReleaseNotificationPlatform.buildNotification(
            context = applicationContext,
            request = request,
        )

        NotificationManagerCompat.from(applicationContext)
            .notify(abs(requestId.hashCode()), notification)

        return Result.success()
    }
}
