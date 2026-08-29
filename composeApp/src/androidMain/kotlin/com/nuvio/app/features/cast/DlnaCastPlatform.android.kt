package com.nuvio.app.features.cast

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
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
            DlnaScanResult.Failure(e.message ?: "Błąd skanowania")
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

        val localIp = getLocalIpAddress() ?: throw IllegalStateException("Brak adresu IP WiFi - sprawdź połączenie")
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

        // Stop old proxy
        try { proxyServer?.stop() } catch (_: Exception) {}

        val server: LocalHttpProxyServer = if (shouldTranscode) {
            Log.i(TAG, "Creating transcoding proxy for codec=${request.codecHint}, maxRes=${settings.maxResolution}")
            TranscodingProxyServer(
                port = 0,
                sourceUrl = request.sourceUrl,
                sourceHeaders = request.sourceHeaders,
                mimeType = mime,
                shouldTranscode = true,
                maxResolution = settings.maxResolution,
                useHardwareAccel = settings.useHardwareAcceleration,
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
            .post(okhttp3.RequestBody.create(okhttp3.MediaType.parse("text/xml; charset=\"utf-8\""), setUriBody))
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
            .post(okhttp3.RequestBody.create(okhttp3.MediaType.parse("text/xml; charset=\"utf-8\""), playBody))
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
                .post(okhttp3.RequestBody.create(okhttp3.MediaType.parse("text/xml; charset=\"utf-8\""), body))
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

    actual suspend fun seekPlayback(device: DlnaDevice, positionMs: Long): Boolean = withContext(Dispatchers.IO) {
        return@withContext try {
            val client = OkHttpClient.Builder().connectTimeout(3, TimeUnit.SECONDS).readTimeout(3, TimeUnit.SECONDS).build()
            val target = DlnaSoap.formatDurationMs(positionMs)
            val body = DlnaSoap.buildSeekBody(target = target)
            val req = Request.Builder()
                .url(device.controlUrl)
                .post(okhttp3.RequestBody.create(okhttp3.MediaType.parse("text/xml; charset=\"utf-8\""), body))
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
