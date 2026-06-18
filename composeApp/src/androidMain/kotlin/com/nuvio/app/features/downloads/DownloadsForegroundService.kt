package com.nuvio.app.features.downloads

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.nuvio.app.MainActivity
import com.nuvio.app.R
import com.nuvio.app.core.deeplink.buildDownloadsDeepLinkUrl
import kotlinx.coroutines.runBlocking
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.downloads_channel_description
import nuvio.composeapp.generated.resources.downloads_channel_name
import nuvio.composeapp.generated.resources.downloads_foreground_subtitle
import nuvio.composeapp.generated.resources.downloads_foreground_title
import org.jetbrains.compose.resources.getString
import kotlin.math.abs

internal class DownloadsForegroundService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private val mainHandler by lazy { Handler(Looper.getMainLooper()) }

    override fun onBind(intent: Intent?): IBinder? = null

    internal fun detachNotificationAndStop() {
        mainHandler.post {
            stopForeground(STOP_FOREGROUND_DETACH)
            stopSelf()
        }
    }

    override fun onCreate() {
        super.onCreate()
        instanceRef = this
        promoteToForeground(currentPrimary())
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        promoteToForeground(currentPrimary())
        acquireWakeLock()
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        if (instanceRef === this) instanceRef = null
        releaseWakeLock()
        super.onDestroy()
    }

    private fun promoteToForeground(primary: PrimaryDownload?) {
        ensureNotificationChannel()
        val notification = buildNotification(primary)
        val notifId = primary?.notificationId ?: fallbackNotificationId
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                notifId,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            )
        } else {
            startForeground(notifId, notification)
        }
    }

    private fun swapPrimary(primary: PrimaryDownload) {
        promoteToForeground(primary)
    }

    private fun buildNotification(primary: PrimaryDownload?): Notification {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse(buildDownloadsDeepLinkUrl())
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val launchPendingIntent = PendingIntent.getActivity(
            this,
            primary?.notificationId ?: fallbackNotificationId,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val title = primary?.displayTitle?.takeIf { it.isNotBlank() }
            ?: runBlocking { getString(Res.string.downloads_foreground_title) }
        val subtitle = runBlocking { getString(Res.string.downloads_foreground_subtitle) }

        return NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification_small)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setContentIntent(launchPendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setProgress(0, 0, true)
            .build()
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            ?: return
        if (manager.getNotificationChannel(channelId) != null) return
        manager.createNotificationChannel(
            NotificationChannel(
                channelId,
                runBlocking { getString(Res.string.downloads_channel_name) },
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = runBlocking { getString(Res.string.downloads_channel_description) }
                setShowBadge(false)
                setSound(null, null)
                enableVibration(false)
            },
        )
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
        val lock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            wakeLockTag,
        ).apply { setReferenceCounted(false) }
        runCatching { lock.acquire(wakeLockTimeoutMs) }
        wakeLock = lock
    }

    private fun releaseWakeLock() {
        wakeLock?.let { lock ->
            runCatching {
                if (lock.isHeld) lock.release()
            }
        }
        wakeLock = null
    }

    companion object {
        // Same channel as DownloadsLiveStatusPlatform so the FGS notification and the
        // per-item progress notification collapse into a single notification.
        private const val channelId = "downloads_live_status"
        private const val fallbackNotificationId = 0x4E55_4400 // "NUD "
        private const val wakeLockTag = "Nuvio:DownloadsForegroundService"
        private const val wakeLockTimeoutMs = 6L * 60L * 60L * 1000L

        private val activeDownloads = LinkedHashMap<String, String>()
        @Volatile private var instanceRef: DownloadsForegroundService? = null

        fun retain(context: Context, downloadId: String, displayTitle: String) {
            val outcome = synchronized(activeDownloads) {
                val wasEmpty = activeDownloads.isEmpty()
                val previousPrimaryId = activeDownloads.keys.firstOrNull()
                activeDownloads[downloadId] = displayTitle
                val nextPrimary = currentPrimaryLocked()
                RetainOutcome(
                    shouldStart = wasEmpty,
                    primaryChanged = previousPrimaryId != nextPrimary?.id,
                    nextPrimary = nextPrimary,
                )
            }

            if (outcome.shouldStart) {
                val intent = Intent(context, DownloadsForegroundService::class.java)
                runCatching {
                    ContextCompat.startForegroundService(context, intent)
                }.onFailure {
                    synchronized(activeDownloads) { activeDownloads.remove(downloadId) }
                }
            } else if (outcome.primaryChanged && outcome.nextPrimary != null) {
                instanceRef?.swapPrimary(outcome.nextPrimary)
            }
        }

        fun release(context: Context, downloadId: String) {
            val outcome = synchronized(activeDownloads) {
                val previousPrimaryId = activeDownloads.keys.firstOrNull()
                activeDownloads.remove(downloadId)
                val nextPrimary = currentPrimaryLocked()
                ReleaseOutcome(
                    shouldStop = activeDownloads.isEmpty(),
                    primaryChanged = previousPrimaryId != nextPrimary?.id,
                    nextPrimary = nextPrimary,
                )
            }

            if (outcome.shouldStop) {
                val instance = instanceRef
                if (instance != null) {
                    instance.detachNotificationAndStop()
                } else {
                    val intent = Intent(context, DownloadsForegroundService::class.java)
                    runCatching { context.stopService(intent) }
                }
            } else if (outcome.primaryChanged && outcome.nextPrimary != null) {
                instanceRef?.swapPrimary(outcome.nextPrimary)
            }
        }

        private fun currentPrimary(): PrimaryDownload? = synchronized(activeDownloads) {
            currentPrimaryLocked()
        }

        private fun currentPrimaryLocked(): PrimaryDownload? {
            val entry = activeDownloads.entries.firstOrNull() ?: return null
            return PrimaryDownload(
                id = entry.key,
                displayTitle = entry.value,
                notificationId = abs(entry.key.hashCode()),
            )
        }
    }

    private data class PrimaryDownload(
        val id: String,
        val displayTitle: String,
        val notificationId: Int,
    )

    private data class RetainOutcome(
        val shouldStart: Boolean,
        val primaryChanged: Boolean,
        val nextPrimary: PrimaryDownload?,
    )

    private data class ReleaseOutcome(
        val shouldStop: Boolean,
        val primaryChanged: Boolean,
        val nextPrimary: PrimaryDownload?,
    )
}
