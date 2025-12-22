package com.nuvio.app.mpv

import android.graphics.Color
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.RCTEventEmitter

class MpvPlayerViewManager(
    private val reactContext: ReactApplicationContext
) : SimpleViewManager<MPVView>() {

    companion object {
        const val REACT_CLASS = "MpvPlayer"
        
        // Commands
        const val COMMAND_SEEK = 1
        const val COMMAND_SET_AUDIO_TRACK = 2
        const val COMMAND_SET_SUBTITLE_TRACK = 3
    }

    override fun getName(): String = REACT_CLASS

    override fun createViewInstance(context: ThemedReactContext): MPVView {
        val view = MPVView(context)
        // Note: Do NOT set background color - it will block the SurfaceView content
        
        // Set up event callbacks
        view.onLoadCallback = { duration, width, height ->
            val event = Arguments.createMap().apply {
                putDouble("duration", duration)
                putInt("width", width)
                putInt("height", height)
            }
            sendEvent(context, view.id, "onLoad", event)
        }
        
        view.onProgressCallback = { position, duration ->
            val event = Arguments.createMap().apply {
                putDouble("currentTime", position)
                putDouble("duration", duration)
            }
            sendEvent(context, view.id, "onProgress", event)
        }
        
        view.onEndCallback = {
            sendEvent(context, view.id, "onEnd", Arguments.createMap())
        }
        
        view.onErrorCallback = { message ->
            val event = Arguments.createMap().apply {
                putString("error", message)
            }
            sendEvent(context, view.id, "onError", event)
        }
        
        return view
    }

    private fun sendEvent(context: ThemedReactContext, viewId: Int, eventName: String, params: com.facebook.react.bridge.WritableMap) {
        context.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(viewId, eventName, params)
    }

    override fun getExportedCustomBubblingEventTypeConstants(): Map<String, Any> {
        return MapBuilder.builder<String, Any>()
            .put("onLoad", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onLoad")))
            .put("onProgress", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onProgress")))
            .put("onEnd", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onEnd")))
            .put("onError", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onError")))
            .build()
    }

    override fun getCommandsMap(): Map<String, Int> {
        return MapBuilder.of(
            "seek", COMMAND_SEEK,
            "setAudioTrack", COMMAND_SET_AUDIO_TRACK,
            "setSubtitleTrack", COMMAND_SET_SUBTITLE_TRACK
        )
    }

    override fun receiveCommand(view: MPVView, commandId: String?, args: ReadableArray?) {
        when (commandId) {
            "seek" -> {
                args?.getDouble(0)?.let { view.seekTo(it) }
            }
            "setAudioTrack" -> {
                args?.getInt(0)?.let { view.setAudioTrack(it) }
            }
            "setSubtitleTrack" -> {
                args?.getInt(0)?.let { view.setSubtitleTrack(it) }
            }
        }
    }

    // React Props

    @ReactProp(name = "source")
    fun setSource(view: MPVView, source: String?) {
        source?.let { view.setDataSource(it) }
    }

    @ReactProp(name = "paused")
    fun setPaused(view: MPVView, paused: Boolean) {
        view.setPaused(paused)
    }

    @ReactProp(name = "volume", defaultFloat = 1.0f)
    fun setVolume(view: MPVView, volume: Float) {
        view.setVolume(volume.toDouble())
    }

    @ReactProp(name = "rate", defaultFloat = 1.0f)
    fun setRate(view: MPVView, rate: Float) {
        view.setSpeed(rate.toDouble())
    }

    // Handle backgroundColor prop to prevent crash from React Native style system
    @ReactProp(name = "backgroundColor", customType = "Color")
    fun setBackgroundColor(view: MPVView, color: Int?) {
        // Intentionally ignoring - background color would block the TextureView content
        // Leave the view transparent
    }
}
