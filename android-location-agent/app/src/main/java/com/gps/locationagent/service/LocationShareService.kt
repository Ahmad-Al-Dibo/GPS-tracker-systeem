package com.gps.locationagent.service

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.gps.locationagent.LocationAgentApp
import com.gps.locationagent.data.LogEntry
import com.gps.locationagent.ui.MainActivity
import com.gps.locationagent.util.IntervalBounds
import com.gps.locationagent.util.SettingsStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Foreground-service die op het ingestelde interval locatie ophaalt
 * en naar alle ingeschakelde API's stuurt. Logt responses/fouten in Room.
 */
class LocationShareService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var fused: FusedLocationProviderClient
    private lateinit var settings: SettingsStore
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    private fun apiKey(): String {
        val prefs = getSharedPreferences("gps_agent", MODE_PRIVATE)
        return prefs.getString("api_key", "") ?: ""
    }

    private suspend fun apiKeyFlow(): String = settings.currentApiKey()

    private var sendLoopJob: Job? = null
    private var lastLat: Double? = null
    private var lastLon: Double? = null
    private var lastAccuracy: Float? = null
    private var lastSpeed: Float? = null
    private var lastFixAt: Long = 0L

    override fun onCreate() {
        super.onCreate()
        fused = LocationServices.getFusedLocationProviderClient(this)
        settings = SettingsStore(this)
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopSharing("Handmatig gestopt")
                return START_NOT_STICKY
            }
        }
        startAsForeground()
        startLocationUpdates()
        startSendLoop()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        sendLoopJob?.cancel()
        fused.removeLocationUpdates(callback)
        scope.cancel()
        super.onDestroy()
    }

    private fun startAsForeground() {
        val notification = buildNotification("Locatie delen gestart")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIF_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            )
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    @Suppress("MissingPermission")
    private fun startLocationUpdates() {
        val hasFine = ContextCompat.checkSelfPermission(
            this, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val hasCoarse = ContextCompat.checkSelfPermission(
            this, Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        if (!hasFine && !hasCoarse) {
            log("ERROR", "service", "Locatiepermissie ontbreekt; service stopt")
            stopSelf()
            return
        }

        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5_000L)
            .setMinUpdateIntervalMillis(3_000L)
            .build()

        fused.requestLocationUpdates(request, callback, Looper.getMainLooper())
    }

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val loc = result.lastLocation ?: return
            lastLat = loc.latitude
            lastLon = loc.longitude
            lastAccuracy = loc.accuracy
            lastSpeed = if (loc.hasSpeed()) loc.speed else null
            lastFixAt = System.currentTimeMillis()
        }
    }

    private fun startSendLoop() {
        sendLoopJob?.cancel()
        sendLoopJob = scope.launch {
            while (isActive) {
                val interval = IntervalBounds.clamp(settings.currentInterval())
                val sharing = settings.sharingEnabled.first()
                if (sharing) {
                    sendToAllApis()
                }
                delay(interval * 1000L)
            }
        }
    }

    private suspend fun sendToAllApis() {
        val apis = (application as LocationAgentApp).database.apiConfigDao().getEnabled()
        if (apis.isEmpty()) {
            log("WARN", "service", "Geen ingeschakelde API-configuratie")
            return
        }

        val lat = lastLat
        val lon = lastLon
        if (lat == null || lon == null) {
            log("WARN", "service", "Nog geen GPS-fix; wachten op locatie")
            return
        }

        for (api in apis) {
            // Elke API stuurt payload met dié naam als "name" (dashboard-groepering)
            val payload = JSONObject().apply {
                put("name", api.name)
                put("latitude", lat)
                put("longitude", lon)
                put("accuracyMeters", lastAccuracy ?: -1.0)
                if (lastSpeed != null) put("speedMps", lastSpeed!!)
                put("sampledAt", lastFixAt)
                put("receivedAt", System.currentTimeMillis())
                put("event_id", java.util.UUID.randomUUID().toString())
                put("source", "android_location_agent")
            }.toString()
            sendOne(api.name, api.url, api.httpMethod, api.apiKey, api.headersRaw, api.bodyTemplate, payload)
        }
    }

    private suspend fun sendOne(
        name: String,
        url: String,
        method: String,
        apiKey: String,
        headersRaw: String,
        bodyTemplate: String,
        defaultPayload: String
    ) {
        try {
            val bodyStr = if (bodyTemplate.isNotBlank()) {
                bodyTemplate
                    .replace("{name}", name)
                    .replace("{latitude}", lastLat?.toString() ?: "")
                    .replace("{longitude}", lastLon?.toString() ?: "")
                    .replace("{accuracy}", (lastAccuracy ?: -1f).toString())
                    .replace("{sampledAt}", lastFixAt.toString())
                    .replace("{receivedAt}", System.currentTimeMillis().toString())
            } else {
                defaultPayload
            }

            val media = "application/json; charset=utf-8".toMediaType()
            val body = bodyStr.toRequestBody(media)
            val builder = Request.Builder().url(url)
            // API-key van het GPS-platform
            if (apiKey.isNotBlank()) {
                builder.addHeader("X-API-Key", apiKey.trim())
            }
            headersRaw.lines()
                .map { it.trim() }
                .filter { it.contains(':') }
                .forEach { line ->
                    val idx = line.indexOf(':')
                    builder.addHeader(line.substring(0, idx).trim(), line.substring(idx + 1).trim())
                }

            val req = when (method.uppercase()) {
                "PUT" -> builder.put(body)
                "PATCH" -> builder.patch(body)
                else -> builder.post(body)
            }.build()

            log("HTTP", name, "→ $method $url")
            val response = http.newCall(req).execute()
            val code = response.code
            val respBody = response.body?.string()?.take(500).orEmpty()
            response.close()

            if (response.isSuccessful) {
                log("HTTP", name, "← $code OK ${respBody.ifBlank { "(leeg)" }}")
            } else {
                log("ERROR", name, "← $code $respBody")
            }
        } catch (e: Exception) {
            log("ERROR", name, "Verzoek mislukt: ${e.javaClass.simpleName}: ${e.message}")
        }
    }

    private fun stopSharing(reason: String) {
        sendLoopJob?.cancel()
        fused.removeLocationUpdates(callback)
        log("INFO", "service", "Delen gestopt: $reason")
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun log(level: String, api: String, message: String) {
        scope.launch {
            (application as LocationAgentApp).database.logDao().insert(
                LogEntry(level = level, apiName = api, message = message)
            )
        }
    }

    private fun createChannel() {
        val mgr = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(com.gps.locationagent.R.string.notification_channel),
            NotificationManager.IMPORTANCE_LOW
        )
        mgr.createNotificationChannel(channel)
    }

    private fun buildNotification(content: String): Notification {
        val pi = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(com.gps.locationagent.R.string.notification_title))
            .setContentText(content)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pi)
            .setOngoing(true)
            .build()
    }

    companion object {
        const val ACTION_STOP = "com.gps.locationagent.STOP"
        private const val CHANNEL_ID = "location_share"
        private const val NOTIF_ID = 1001
    }
}
