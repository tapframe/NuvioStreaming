package com.nuvio.app.mpv

import android.content.Context
import android.graphics.SurfaceTexture
import android.util.AttributeSet
import android.util.Log
import android.view.Surface
import android.view.TextureView
import dev.jdtech.mpv.MPVLib

class MPVView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : TextureView(context, attrs, defStyleAttr), TextureView.SurfaceTextureListener, MPVLib.EventObserver {

    companion object {
        private const val TAG = "MPVView"
    }

    private var isMpvInitialized = false
    private var pendingDataSource: String? = null
    private var isPaused: Boolean = true
    private var surface: Surface? = null

    // Event listener for React Native
    var onLoadCallback: ((duration: Double, width: Int, height: Int) -> Unit)? = null
    var onProgressCallback: ((position: Double, duration: Double) -> Unit)? = null
    var onEndCallback: (() -> Unit)? = null
    var onErrorCallback: ((message: String) -> Unit)? = null

    init {
        surfaceTextureListener = this
        isOpaque = false
    }

    override fun onSurfaceTextureAvailable(surfaceTexture: SurfaceTexture, width: Int, height: Int) {
        Log.d(TAG, "Surface texture available: ${width}x${height}")
        try {
            surface = Surface(surfaceTexture)
            
            MPVLib.create(context.applicationContext)
            initOptions()
            MPVLib.init()
            MPVLib.attachSurface(surface!!)
            MPVLib.addObserver(this)
            MPVLib.setPropertyString("android-surface-size", "${width}x${height}")
            observeProperties()
            isMpvInitialized = true
            
            // If a data source was set before surface was ready, load it now
            pendingDataSource?.let { url ->
                loadFile(url)
                pendingDataSource = null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize MPV", e)
            onErrorCallback?.invoke("MPV initialization failed: ${e.message}")
        }
    }

    override fun onSurfaceTextureSizeChanged(surfaceTexture: SurfaceTexture, width: Int, height: Int) {
        Log.d(TAG, "Surface texture size changed: ${width}x${height}")
        if (isMpvInitialized) {
            MPVLib.setPropertyString("android-surface-size", "${width}x${height}")
        }
    }

    override fun onSurfaceTextureDestroyed(surfaceTexture: SurfaceTexture): Boolean {
        Log.d(TAG, "Surface texture destroyed")
        if (isMpvInitialized) {
            MPVLib.removeObserver(this)
            MPVLib.detachSurface()
            MPVLib.destroy()
            isMpvInitialized = false
        }
        surface?.release()
        surface = null
        return true
    }

    override fun onSurfaceTextureUpdated(surfaceTexture: SurfaceTexture) {
        // Called when the SurfaceTexture is updated via updateTexImage()
    }

    private fun initOptions() {
        // Mobile-optimized profile
        MPVLib.setOptionString("profile", "fast")
        MPVLib.setOptionString("vo", "gpu")
        MPVLib.setOptionString("gpu-context", "android")
        MPVLib.setOptionString("opengl-es", "yes")
        MPVLib.setOptionString("hwdec", "mediacodec,mediacodec-copy")
        MPVLib.setOptionString("hwdec-codecs", "h264,hevc,mpeg4,mpeg2video,vp8,vp9,av1")
        MPVLib.setOptionString("ao", "audiotrack,opensles")
        
        // Network caching for streaming
        MPVLib.setOptionString("demuxer-max-bytes", "67108864") // 64MB
        MPVLib.setOptionString("demuxer-max-back-bytes", "33554432") // 32MB
        MPVLib.setOptionString("cache", "yes")
        MPVLib.setOptionString("cache-secs", "30")
        
        // Disable terminal/input
        MPVLib.setOptionString("terminal", "no")
        MPVLib.setOptionString("input-default-bindings", "no")
    }

    private fun observeProperties() {
        // MPV format constants (from MPVLib source)
        val MPV_FORMAT_NONE = 0
        val MPV_FORMAT_FLAG = 3
        val MPV_FORMAT_INT64 = 4
        val MPV_FORMAT_DOUBLE = 5
        
        MPVLib.observeProperty("time-pos", MPV_FORMAT_DOUBLE)
        MPVLib.observeProperty("duration", MPV_FORMAT_DOUBLE)
        MPVLib.observeProperty("pause", MPV_FORMAT_FLAG)
        MPVLib.observeProperty("paused-for-cache", MPV_FORMAT_FLAG)
        MPVLib.observeProperty("eof-reached", MPV_FORMAT_FLAG)
        MPVLib.observeProperty("video-params/aspect", MPV_FORMAT_DOUBLE)
        MPVLib.observeProperty("width", MPV_FORMAT_INT64)
        MPVLib.observeProperty("height", MPV_FORMAT_INT64)
        MPVLib.observeProperty("track-list", MPV_FORMAT_NONE)
    }

    private fun loadFile(url: String) {
        Log.d(TAG, "Loading file: $url")
        MPVLib.command(arrayOf("loadfile", url))
    }

    // Public API

    fun setDataSource(url: String) {
        if (isMpvInitialized) {
            loadFile(url)
        } else {
            pendingDataSource = url
        }
    }

    fun setPaused(paused: Boolean) {
        isPaused = paused
        if (isMpvInitialized) {
            MPVLib.setPropertyBoolean("pause", paused)
        }
    }

    fun seekTo(positionSeconds: Double) {
        Log.d(TAG, "seekTo called: positionSeconds=$positionSeconds, isMpvInitialized=$isMpvInitialized")
        if (isMpvInitialized) {
            Log.d(TAG, "Executing MPV seek command: seek $positionSeconds absolute")
            MPVLib.command(arrayOf("seek", positionSeconds.toString(), "absolute"))
        }
    }

    fun setSpeed(speed: Double) {
        if (isMpvInitialized) {
            MPVLib.setPropertyDouble("speed", speed)
        }
    }

    fun setVolume(volume: Double) {
        if (isMpvInitialized) {
            // MPV volume is 0-100
            MPVLib.setPropertyDouble("volume", volume * 100.0)
        }
    }

    fun setAudioTrack(trackId: Int) {
        if (isMpvInitialized) {
            if (trackId == -1) {
                MPVLib.setPropertyString("aid", "no")
            } else {
                MPVLib.setPropertyInt("aid", trackId)
            }
        }
    }

    fun setSubtitleTrack(trackId: Int) {
        if (isMpvInitialized) {
            if (trackId == -1) {
                MPVLib.setPropertyString("sid", "no")
            } else {
                MPVLib.setPropertyInt("sid", trackId)
            }
        }
    }

    // MPVLib.EventObserver implementation

    override fun eventProperty(property: String) {
        Log.d(TAG, "Property changed: $property")
        when (property) {
            "track-list" -> {
                // Track list updated, could notify JS about available tracks
            }
        }
    }

    override fun eventProperty(property: String, value: Long) {
        Log.d(TAG, "Property $property = $value (Long)")
    }

    override fun eventProperty(property: String, value: Double) {
        Log.d(TAG, "Property $property = $value (Double)")
        when (property) {
            "time-pos" -> {
                val duration = MPVLib.getPropertyDouble("duration") ?: 0.0
                onProgressCallback?.invoke(value, duration)
            }
            "duration" -> {
                val width = MPVLib.getPropertyInt("width") ?: 0
                val height = MPVLib.getPropertyInt("height") ?: 0
                onLoadCallback?.invoke(value, width, height)
            }
        }
    }

    override fun eventProperty(property: String, value: Boolean) {
        Log.d(TAG, "Property $property = $value (Boolean)")
        when (property) {
            "eof-reached" -> {
                if (value) {
                    onEndCallback?.invoke()
                }
            }
        }
    }

    override fun eventProperty(property: String, value: String) {
        Log.d(TAG, "Property $property = $value (String)")
    }

    override fun event(eventId: Int) {
        Log.d(TAG, "Event: $eventId")
        // MPV event constants (from MPVLib source)
        val MPV_EVENT_FILE_LOADED = 8
        val MPV_EVENT_END_FILE = 7
        
        when (eventId) {
            MPV_EVENT_FILE_LOADED -> {
                // File is loaded, start playback if not paused
                if (!isPaused) {
                    MPVLib.setPropertyBoolean("pause", false)
                }
            }
            MPV_EVENT_END_FILE -> {
                onEndCallback?.invoke()
            }
        }
    }
}
