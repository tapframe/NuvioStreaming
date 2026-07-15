package com.nuvio.app.features.player

import android.app.Activity
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.drawable.Icon
import android.os.Build
import kotlin.math.roundToInt
import kotlinx.coroutines.runBlocking
import android.os.Handler
import android.os.Looper
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.compose.ui.unit.IntSize
import androidx.lifecycle.Lifecycle
import com.nuvio.app.R
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.getString

internal const val PIP_ACTION_TOGGLE_PLAY_PAUSE = "com.nuvio.app.action.PIP_TOGGLE_PLAY_PAUSE"

internal object PlayerPictureInPictureManager {
    private data class SessionState(
        val isActive: Boolean = false,
        val isPlaying: Boolean = false,
        val videoSize: IntSize = IntSize.Zero,
    )

    private var sessionState = SessionState()
    private var lastAppliedSessionState: SessionState? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var wasInPictureInPictureMode = false
    private var pendingPictureInPictureExitCheck: Runnable? = null
    private var pausePlaybackCallback: (() -> Unit)? = null
    private var togglePlaybackCallback: (() -> Unit)? = null

    fun updateSession(
        activity: Activity,
        isActive: Boolean,
        isPlaying: Boolean,
        videoSize: IntSize,
    ) {
        sessionState = SessionState(
            isActive = isActive,
            isPlaying = isPlaying,
            videoSize = videoSize,
        )
        applyPictureInPictureParams(activity)
    }

    fun clearSession(activity: Activity) {
        sessionState = SessionState()
        wasInPictureInPictureMode = false
        clearPendingPictureInPictureExitCheck()
        applyPictureInPictureParams(activity)
    }

    fun registerPausePlaybackCallback(callback: (() -> Unit)?) {
        pausePlaybackCallback = callback
        if (callback == null) {
            clearPendingPictureInPictureExitCheck()
        }
    }

    fun registerTogglePlaybackCallback(callback: (() -> Unit)?) {
        togglePlaybackCallback = callback
    }

    fun onUserLeaveHint(activity: Activity): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return false
        }
        return enterIfEligible(activity)
    }

    fun onPictureInPictureModeChanged(
        activity: ComponentActivity,
        isInPictureInPictureMode: Boolean,
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val wasInPictureInPicture = wasInPictureInPictureMode
        wasInPictureInPictureMode = isInPictureInPictureMode
        clearPendingPictureInPictureExitCheck()

        if (!wasInPictureInPicture || isInPictureInPictureMode) return

        val exitCheck = Runnable {
            val returnedToForeground = activity.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
            if (!returnedToForeground || activity.isFinishing || activity.isDestroyed) {
                pausePlaybackCallback?.invoke()
            }
        }
        pendingPictureInPictureExitCheck = exitCheck
        mainHandler.postDelayed(exitCheck, 250L)
    }

    fun toggleViaRemoteAction(context: Context) {
        val wasPlaying = sessionState.isPlaying
        togglePlaybackCallback?.invoke()
        sessionState = sessionState.copy(isPlaying = !wasPlaying)
        if (context is Activity) {
            applyPictureInPictureParams(context)
        }
    }

    private fun applyPictureInPictureParams(activity: Activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        if (sessionState == lastAppliedSessionState) return
        lastAppliedSessionState = sessionState
        activity.setPictureInPictureParams(buildParams(activity))
    }

    private fun enterIfEligible(activity: Activity): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
        if (!sessionState.isActive || !sessionState.isPlaying) return false
        if (activity.isFinishing) return false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && activity.isInPictureInPictureMode) return false
        return activity.enterPictureInPictureMode(buildParams(activity))
    }

    private fun buildParams(activity: Activity): PictureInPictureParams {
        val builder = PictureInPictureParams.Builder()
        buildAspectRatio(sessionState.videoSize)?.let(builder::setAspectRatio)
        builder.setActions(buildActions(activity))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setAutoEnterEnabled(sessionState.isActive && sessionState.isPlaying)
            builder.setSeamlessResizeEnabled(true)
        }
        return builder.build()
    }

    private fun buildAspectRatio(videoSize: IntSize): Rational? {
        if (videoSize.width <= 0 || videoSize.height <= 0) return null

        val width = videoSize.width.coerceAtLeast(1)
        val height = videoSize.height.coerceAtLeast(1)
        val ratio = width.toDouble() / height.toDouble()

        return when {
            ratio > MaxPictureInPictureAspectRatio ->
                Rational((MaxPictureInPictureAspectRatio * 100).roundToInt(), 100)
            ratio < MinPictureInPictureAspectRatio ->
                Rational(100, (MaxPictureInPictureAspectRatio * 100).roundToInt())
            else -> Rational(width, height)
        }
    }

    private fun buildActions(activity: Activity): List<RemoteAction> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return emptyList()

        val isPlaying = sessionState.isPlaying
        val iconRes = if (isPlaying) R.drawable.ic_player_pause else R.drawable.ic_player_play
        val title = if (isPlaying) pipPauseLabel else pipPlayLabel

        val toggleIntent = Intent(PIP_ACTION_TOGGLE_PLAY_PAUSE).setPackage(activity.packageName)
        val flags = android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
        val pendingIntent = android.app.PendingIntent.getBroadcast(activity, REQUEST_CODE_TOGGLE, toggleIntent, flags)
        val icon = Icon.createWithResource(activity, iconRes)
        icon.setTint(android.graphics.Color.WHITE)
        return listOf(RemoteAction(icon, title, title, pendingIntent))
    }

    private fun clearPendingPictureInPictureExitCheck() {
        pendingPictureInPictureExitCheck?.let(mainHandler::removeCallbacks)
        pendingPictureInPictureExitCheck = null
    }

    private const val REQUEST_CODE_TOGGLE = 1
    private const val MaxPictureInPictureAspectRatio = 2.39
    private const val MinPictureInPictureAspectRatio = 1.0 / MaxPictureInPictureAspectRatio

    private val pipPlayLabel: String by lazy { runBlocking { getString(Res.string.action_play) } }
    private val pipPauseLabel: String by lazy { runBlocking { getString(Res.string.compose_action_pause) } }
}

internal class PipRemoteActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null) return
        if (intent?.action != PIP_ACTION_TOGGLE_PLAY_PAUSE) return
        PlayerPictureInPictureManager.toggleViaRemoteAction(context)
    }

    companion object {
        fun register(context: Context): PipRemoteActionReceiver {
            val filter = IntentFilter(PIP_ACTION_TOGGLE_PLAY_PAUSE)
            val receiver = PipRemoteActionReceiver()
            androidx.core.content.ContextCompat.registerReceiver(
                context,
                receiver,
                filter,
                androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED
            )
            return receiver
        }
    }
}
