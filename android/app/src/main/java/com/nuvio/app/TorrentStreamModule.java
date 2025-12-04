package com.nuvio.app;

import android.os.Environment;
import androidx.annotation.Nullable;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import com.github.se_bastiaan.torrentstream.StreamStatus;
import com.github.se_bastiaan.torrentstream.Torrent;
import com.github.se_bastiaan.torrentstream.TorrentOptions;
import com.github.se_bastiaan.torrentstream.TorrentStream;
import com.github.se_bastiaan.torrentstream.listeners.TorrentListener;

public class TorrentStreamModule extends ReactContextBaseJavaModule implements TorrentListener {

    private final ReactApplicationContext reactContext;
    private TorrentStream torrentStream;
    private boolean isInitialized = false;

    public TorrentStreamModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "TorrentStreamer";
    }

    private void sendEvent(String eventName, @Nullable WritableMap params) {
        if (reactContext.hasActiveCatalystInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
        }
    }

    @ReactMethod
    public void setup() {
        if (isInitialized) return;

        // Save to Downloads folder
        TorrentOptions torrentOptions = new TorrentOptions.Builder()
                .saveLocation(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS))
                .removeFilesAfterStop(true)
                .autoDownload(true)
                .build();

        TorrentStream.init(torrentOptions);
        torrentStream = TorrentStream.getInstance();
        torrentStream.addListener(this);
        isInitialized = true;
    }

    @ReactMethod
    public void start(String magnetUrl) {
        if (!isInitialized) setup();
        Log.d("NuvioTorrent", "Starting: " + magnetUrl);
        torrentStream.startStream(magnetUrl);
    }

    @ReactMethod
    public void stop() {
        if (torrentStream != null) {
            torrentStream.stopStream();
        }
    }

    @Override
    public void onStreamReady(Torrent torrent) {
        Log.d("NuvioTorrent", "Ready: " + torrent.getVideoFile().getAbsolutePath());
        WritableMap params = Arguments.createMap();
        // Prepend file:// so React Native Video can read it
        params.putString("url", "file://" + torrent.getVideoFile().getAbsolutePath());
        sendEvent("TORRENT_READY", params);
    }

    @Override
    public void onStreamProgress(Torrent torrent, StreamStatus status) {
        WritableMap params = Arguments.createMap();
        params.putDouble("bufferProgress", status.bufferProgress);
        params.putDouble("downloadSpeed", status.downloadSpeed);
        params.putInt("seeds", status.seeds);
        sendEvent("TORRENT_PROGRESS", params);
    }

    @Override
    public void onStreamError(Torrent torrent, Exception e) {
        WritableMap params = Arguments.createMap();
        params.putString("error", e.getMessage());
        sendEvent("TORRENT_ERROR", params);
    }

    @Override public void onStreamPrepared(Torrent torrent) { sendEvent("TORRENT_PREPARED", null); }
    @Override public void onStreamStarted(Torrent torrent) {}
    @Override public void onStreamStopped() {}
}
