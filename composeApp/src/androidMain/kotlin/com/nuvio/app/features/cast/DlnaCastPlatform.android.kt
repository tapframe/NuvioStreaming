package com.nuvio.app.features.cast

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.DatagramPacket
import java.net.InetAddress
import java.net.MulticastSocket
import java.net.NetworkInterface
import java.net.URL
import java.util.concurrent.TimeUnit

internal actual object DlnaCastPlatform {
    private const val TAG = "DlnaCastPlatform"
    private const val SSDP_ADDRESS = "239.255.255.250"
    private const val SSDP_PORT = 1900
    private const val SSDP_MX = 3

    private var appContext: Context? = null
    private var proxyServer: LocalHttpProxyServer? = null
    private var proxyLocalIp: String? = null

    fun initialize(context: Context) {
        appContext = context.applicationContext
    }

    actual suspend fun scanDevices(timeoutMs: Int): DlnaScanResult = withContext(Dispatchers.IO) {
        val locations = mutableSetOf<String>()
        var multicastLock: WifiManager.MulticastLock? = null
        var socket: MulticastSocket? = null
        try {
            // Acquire multicast lock
            try {
                val wifi = appContext?.applicationContext?.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                multicastLock = wifi?.createMulticastLock("nuvio_dlna_scan")
                multicastLock?.setReferenceCounted(true)
                multicastLock?.acquire()
            } catch (e: Exception) {
                Log.w(TAG, "MulticastLock acquire failed: ${e.message}")
            }

            socket = MulticastSocket(null).apply {
                reuseAddress = true
                soTimeout = timeoutMs
                timeToLive = 2
            }
            socket.bind(java.net.InetSocketAddress(0))

            val stTargets = listOf(
                "urn:schemas-upnp-org:device:MediaRenderer:1",
                "urn:schemas-upnp-org:service:AVTransport:1",
                "ssdp:all"
            )

            val group = InetAddress.getByName(SSDP_ADDRESS)
            for (st in stTargets) {
                val msg = buildString {
                    append("M-SEARCH * HTTP/1.1\r\n")
                    append("HOST: $SSDP_ADDRESS:$SSDP_PORT\r\n")
                    append("MAN: \"ssdp:discover\"\r\n")
                    append("MX: $SSDP_MX\r\n")
                    append("ST: $st\r\n")
                    append("\r\n")
                }
                val bytes = msg.toByteArray(Charsets.UTF_8)
                val packet = DatagramPacket(bytes, bytes.size, group, SSDP_PORT)
                try {
                    socket.send(packet)
                    Log.d(TAG, "Sent M-SEARCH ST=$st")
                } catch (e: Exception) {
                    Log.w(TAG, "Send failed ST=$st: ${e.message}")
                }
                // small delay between targets
                try { Thread.sleep(150) } catch (_: Exception) {}
            }

            val buffer = ByteArray(8192)
            val deadline = System.currentTimeMillis() + timeoutMs
            while (System.currentTimeMillis() < deadline) {
                val remaining = (deadline - System.currentTimeMillis()).toInt().coerceAtLeast(100)
                socket.soTimeout = remaining.coerceAtMost(1000)
                val packet = DatagramPacket(buffer, buffer.size)
                try {
                    socket.receive(packet)
                } catch (e: java.net.SocketTimeoutException) {
                    // continue loop until deadline
                    continue
                } catch (e: Exception) {
                    Log.w(TAG, "Receive error: ${e.message}")
                    break
                }
                val response = String(packet.data, 0, packet.length, Charsets.UTF_8)
                val location = parseLocationHeader(response)
                if (location != null && location.isNotBlank()) {
                    // Normalize: trim and ensure http
                    val normalized = location.trim()
                    if (normalized.startsWith("http", ignoreCase = true)) {
                        if (locations.add(normalized)) {
                            Log.i(TAG, "Discovered LOCATION: $normalized")
                        }
                    }
                }
            }

            Log.i(TAG, "SSDP discovery finished, found ${locations.size} locations")

            if (locations.isEmpty()) {
                return@withContext DlnaScanResult.Success(emptyList())
            }

            // Fetch device descriptions
            val client = OkHttpClient.Builder()
                .connectTimeout(3, TimeUnit.SECONDS)
                .readTimeout(3, TimeUnit.SECONDS)
                .build()

            val devices = mutableListOf<DlnaDevice>()
            for (location in locations) {
                try {
                    val req = Request.Builder().url(location).get().build()
                    val resp = client.newCall(req).execute()
                    if (!resp.isSuccessful) {
                        Log.w(TAG, "GET $location failed ${resp.code}")
                        continue
                    }
                    val xml = resp.body?.string() ?: continue
                    val parsed = DlnaSoap.parseDeviceDescription(xml, location) ?: run {
                        Log.w(TAG, "Parse failed for $location")
                        continue
                    }
                    // Extract IP for display
                    val ip = try { URL(location).host } catch (_: Exception) { null }
                    val device = DlnaDevice(
                        id = parsed.udn,
                        friendlyName = parsed.friendlyName,
                        modelName = parsed.modelName,
                        manufacturer = parsed.manufacturer,
                        locationUrl = location,
                        controlUrl = parsed.controlUrl,
                        eventSubUrl = parsed.eventSubUrl,
                        avTransportServiceType = parsed.serviceType,
                        ipAddress = ip,
                    )
                    devices.add(device)
                    Log.i(TAG, "Parsed device: ${device.friendlyName} control=${device.controlUrl}")
                } catch (e: Exception) {
                    Log.w(TAG, "Error fetching $location: ${e.message}")
                }
            }

            // Deduplicate by UDN
            val distinct = devices.distinctBy { it.id }
            DlnaScanResult.Success(distinct)
        } catch (e: Exception) {
            Log.e(TAG, "scanDevices error", e)
            DlnaScanResult.Failure(e.message ?: "Scan error")
        } finally {
            try { socket?.close() } catch (_: Exception) {}
            try { multicastLock?.release() } catch (_: Exception) {}
        }
    }

    private fun parseLocationHeader(response: String): String? {
        // Case insensitive search for LOCATION:
        val lines = response.split("\r\n", "\n")
        for (line in lines) {
            if (line.startsWith("LOCATION:", ignoreCase = true) || line.startsWith("Location:", ignoreCase = true)) {
                return line.substringAfter(":").trim()
            }
        }
        // fallback regex
        val regex = Regex("(?i)LOCATION:\\s*(\\S+)")
        return regex.find(response)?.groupValues?.getOrNull(1)?.trim()
    }

    actual suspend fun prepareProxyUrl(request: DlnaCastRequest): String = withContext(Dispatchers.IO) {
        // Ensure settings loaded
        CastSettingsRepository.ensureLoaded()
        val settings = CastSettingsRepository.uiState.value

        val localIp = getLocalIpAddress() ?: throw IllegalStateException("No Wi-Fi IP address - check connection")
        proxyLocalIp = localIp

        // Decide if transcoding needed
        val shouldTranscode = settings.proxyEnabled &&
            settings.transcodeMode != CastTranscodeMode.DISABLED &&
            CastSettingsRepository.shouldTranscodeForCodec(request.codecHint)

        val mime = when {
            shouldTranscode -> "video/mp4"
            request.mimeType.isNotBlank() -> request.mimeType
            else -> "video/mp4"
        }

        // Handle subtitle download for burn-in if needed
        var subtitleFile: java.io.File? = null
        if (shouldTranscode && !request.subtitleUrl.isNullOrBlank()) {
            try {
                val ctx = appContext ?: throw IllegalStateException("No context")
                val dir = java.io.File(ctx.cacheDir, "dlna_subs")
                dir.mkdirs()
                val ext = when {
                    request.subtitleUrl.contains(".ass", ignoreCase = true) -> ".ass"
                    request.subtitleUrl.contains(".ssa", ignoreCase = true) -> ".ssa"
                    request.subtitleUrl.contains(".vtt", ignoreCase = true) -> ".vtt"
                    else -> ".srt"
                }
                val f = java.io.File(dir, "sub_${System.currentTimeMillis()}$ext")
                val client = OkHttpClient.Builder().connectTimeout(5, TimeUnit.SECONDS).readTimeout(10, TimeUnit.SECONDS).build()
                val reqBuilder = Request.Builder().url(request.subtitleUrl).get()
                request.subtitleHeaders.forEach { (k, v) -> if (v.isNotBlank()) reqBuilder.header(k, v) }
                val resp = client.newCall(reqBuilder.build()).execute()
                if (resp.isSuccessful) {
                    val body = resp.body?.bytes()
                    if (body != null) {
                        f.writeBytes(body)
                        subtitleFile = f
                        Log.i(TAG, "Downloaded subtitle to ${f.absolutePath} ${f.length()} bytes")
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Subtitle download failed: ${e.message}")
            }
        }

        // Stop old proxy
        try { proxyServer?.stop() } catch (_: Exception) {}

        val ctx = appContext ?: throw IllegalStateException("No context for proxy")
        val server: LocalHttpProxyServer = if (shouldTranscode) {
            Log.i(TAG, "Creating transcoding proxy for codec=${request.codecHint}, maxRes=${settings.maxResolution} sub=${subtitleFile?.name}")
            TranscodingProxyServer(
                appContext = ctx,
                port = 0,
                sourceUrl = request.sourceUrl,
                sourceHeaders = request.sourceHeaders,
                mimeType = mime,
                shouldTranscode = true,
                maxResolution = settings.maxResolution,
                useHardwareAccel = settings.useHardwareAcceleration,
                subtitleFile = subtitleFile,
            )
        } else {
            Log.i(TAG, "Creating passthrough proxy for ${request.sourceUrl.take(80)}")
            LocalHttpProxyServer(
                port = 0,
                sourceUrl = request.sourceUrl,
                sourceHeaders = request.sourceHeaders,
                mimeType = mime,
            )
        }

        server.start()
        proxyServer = server
        // Wait a bit for port binding
        var attempts = 0
        while (!server.isAlive() && attempts < 10) {
            Thread.sleep(100)
            attempts++
        }
        val port = server.listeningPort
        if (port <= 0) throw IllegalStateException("Proxy nie wystartował")
        val proxyUrl = "http://$localIp:$port/video/cast.mp4"
        Log.i(TAG, "Proxy started at $proxyUrl (transcode=$shouldTranscode)")
        proxyUrl
    }

    actual suspend fun castToDevice(device: DlnaDevice, request: DlnaCastRequest, proxyUrl: String): Boolean = withContext(Dispatchers.IO) {
        val mime = if (CastSettingsRepository.shouldTranscodeForCodec(request.codecHint)) "video/mp4" else request.mimeType.ifBlank { "video/mp4" }
        val didl = DlnaSoap.buildDidlMetadata(
            title = request.title.ifBlank { "Nuvio Cast" },
            proxyUrl = proxyUrl,
            mimeType = mime,
            duration = request.durationMs?.let { DlnaSoap.formatDurationMs(it) }
        )
        val setUriBody = DlnaSoap.buildSetAvTransportUriBody(uri = proxyUrl, metadata = didl)
        val playBody = DlnaSoap.buildPlayBody()

        val client = OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(5, TimeUnit.SECONDS)
            .build()

        // SetAVTransportURI
        val setReq = Request.Builder()
            .url(device.controlUrl)
            .post(setUriBody.toRequestBody("text/xml; charset=\"utf-8\"".toMediaType()))
            .header("Content-Type", "text/xml; charset=\"utf-8\"")
            .header("SOAPACTION", "\"${device.avTransportServiceType}#SetAVTransportURI\"")
            .build()

        Log.i(TAG, "POST SetAVTransportURI to ${device.controlUrl} uri=$proxyUrl")
        val setResp = client.newCall(setReq).execute()
        val setBody = setResp.body?.string() ?: ""
        Log.i(TAG, "SetAVTransportURI response ${setResp.code} body=${setBody.take(500)}")
        if (!setResp.isSuccessful) {
            Log.e(TAG, "SetAVTransportURI failed ${setResp.code}")
            return@withContext false
        }

        // Small delay before Play (some TVs need it)
        try { Thread.sleep(300) } catch (_: Exception) {}

        val playReq = Request.Builder()
            .url(device.controlUrl)
            .post(playBody.toRequestBody("text/xml; charset=\"utf-8\"".toMediaType()))
            .header("Content-Type", "text/xml; charset=\"utf-8\"")
            .header("SOAPACTION", "\"${device.avTransportServiceType}#Play\"")
            .build()

        Log.i(TAG, "POST Play to ${device.controlUrl}")
        val playResp = client.newCall(playReq).execute()
        val playBodyResp = playResp.body?.string() ?: ""
        Log.i(TAG, "Play response ${playResp.code} body=${playBodyResp.take(500)}")
        playResp.isSuccessful
    }

    actual suspend fun stopPlayback(device: DlnaDevice): Boolean = withContext(Dispatchers.IO) {
        return@withContext try {
            val client = OkHttpClient.Builder().connectTimeout(3, TimeUnit.SECONDS).readTimeout(3, TimeUnit.SECONDS).build()
            val body = DlnaSoap.buildStopBody()
            val req = Request.Builder()
                .url(device.controlUrl)
                .post(body.toRequestBody("text/xml; charset=\"utf-8\"".toMediaType()))
                .header("Content-Type", "text/xml; charset=\"utf-8\"")
                .header("SOAPACTION", "\"${device.avTransportServiceType}#Stop\"")
                .build()
            val resp = client.newCall(req).execute()
            Log.i(TAG, "Stop response ${resp.code}")
            resp.isSuccessful
        } catch (e: Exception) {
            Log.w(TAG, "stopPlayback failed: ${e.message}")
            false
        }
    }

    actual suspend fun pausePlayback(device: DlnaDevice): Boolean = withContext(Dispatchers.IO) {
        return@withContext try {
            val client = OkHttpClient.Builder().connectTimeout(3, TimeUnit.SECONDS).readTimeout(3, TimeUnit.SECONDS).build()
            val body = DlnaSoap.buildPauseBody()
            val req = Request.Builder()
                .url(device.controlUrl)
                .post(body.toRequestBody("text/xml; charset=\"utf-8\"".toMediaType()))
                .header("Content-Type", "text/xml; charset=\"utf-8\"")
                .header("SOAPACTION", "\"${device.avTransportServiceType}#Pause\"")
                .build()
            val resp = client.newCall(req).execute()
            Log.i(TAG, "Pause response ${resp.code}")
            resp.isSuccessful
        } catch (e: Exception) {
            Log.w(TAG, "pause failed: ${e.message}")
            false
        }
    }

    actual suspend fun resumePlayback(device: DlnaDevice): Boolean = withContext(Dispatchers.IO) {
        return@withContext try {
            val client = OkHttpClient.Builder().connectTimeout(3, TimeUnit.SECONDS).readTimeout(3, TimeUnit.SECONDS).build()
            val body = DlnaSoap.buildPlayBody()
            val req = Request.Builder()
                .url(device.controlUrl)
                .post(body.toRequestBody("text/xml; charset=\"utf-8\"".toMediaType()))
                .header("Content-Type", "text/xml; charset=\"utf-8\"")
                .header("SOAPACTION", "\"${device.avTransportServiceType}#Play\"")
                .build()
            val resp = client.newCall(req).execute()
            Log.i(TAG, "Resume Play response ${resp.code}")
            resp.isSuccessful
        } catch (e: Exception) {
            Log.w(TAG, "resume failed: ${e.message}")
            false
        }
    }

    actual suspend fun getPositionInfo(device: DlnaDevice): Long? = withContext(Dispatchers.IO) {
        return@withContext try {
            val client = OkHttpClient.Builder().connectTimeout(3, TimeUnit.SECONDS).readTimeout(3, TimeUnit.SECONDS).build()
            val body = DlnaSoap.buildGetPositionInfoBody()
            val req = Request.Builder()
                .url(device.controlUrl)
                .post(body.toRequestBody("text/xml; charset=\"utf-8\"".toMediaType()))
                .header("Content-Type", "text/xml; charset=\"utf-8\"")
                .header("SOAPACTION", "\"${device.avTransportServiceType}#GetPositionInfo\"")
                .build()
            val resp = client.newCall(req).execute()
            val xml = resp.body?.string() ?: return@withContext null
            DlnaSoap.parsePositionInfo(xml)
        } catch (e: Exception) {
            Log.w(TAG, "getPositionInfo failed: ${e.message}")
            null
        }
    }

    actual suspend fun seekPlayback(device: DlnaDevice, positionMs: Long): Boolean = withContext(Dispatchers.IO) {
        return@withContext try {
            val client = OkHttpClient.Builder().connectTimeout(3, TimeUnit.SECONDS).readTimeout(3, TimeUnit.SECONDS).build()
            val target = DlnaSoap.formatDurationMs(positionMs)
            val body = DlnaSoap.buildSeekBody(target = target)
            val req = Request.Builder()
                .url(device.controlUrl)
                .post(body.toRequestBody("text/xml; charset=\"utf-8\"".toMediaType()))
                .header("Content-Type", "text/xml; charset=\"utf-8\"")
                .header("SOAPACTION", "\"${device.avTransportServiceType}#Seek\"")
                .build()
            val resp = client.newCall(req).execute()
            Log.i(TAG, "Seek $target response ${resp.code}")
            resp.isSuccessful
        } catch (e: Exception) {
            Log.w(TAG, "seek failed: ${e.message}")
            false
        }
    }

    actual suspend fun getLocalIpAddress(): String? = withContext(Dispatchers.IO) {
        try {
            // Prefer WiFi interface
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val intf = interfaces.nextElement()
                if (!intf.isUp || intf.isLoopback || intf.name.contains("rmnet", ignoreCase = true)) continue
                val addrs = intf.inetAddresses
                while (addrs.hasMoreElements()) {
                    val addr = addrs.nextElement()
                    if (addr.isLoopbackAddress) continue
                    val host = addr.hostAddress ?: continue
                    // IPv4 only for DLNA (Samsung old TV doesn't do IPv6)
                    if (host.contains(":") ) continue // skip IPv6
                    if (host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("172.")) {
                        Log.i(TAG, "Local IP candidate $host from ${intf.name}")
                        return@withContext host
                    }
                }
            }
            // Fallback: try WifiManager
            val wifi = appContext?.applicationContext?.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            val ipInt = wifi?.connectionInfo?.ipAddress ?: 0
            if (ipInt != 0) {
                val ip = String.format(
                    "%d.%d.%d.%d",
                    ipInt and 0xff,
                    ipInt shr 8 and 0xff,
                    ipInt shr 16 and 0xff,
                    ipInt shr 24 and 0xff
                )
                if (ip != "0.0.0.0") {
                    Log.i(TAG, "Local IP from WifiManager: $ip")
                    return@withContext ip
                }
            }
            null
        } catch (e: Exception) {
            Log.w(TAG, "getLocalIpAddress failed: ${e.message}")
            null
        }
    }

    actual fun stopProxy() {
        try {
            proxyServer?.stop()
            Log.i(TAG, "Proxy stopped")
        } catch (e: Exception) {
            Log.w(TAG, "stopProxy error: ${e.message}")
        } finally {
            proxyServer = null
        }
    }
}
