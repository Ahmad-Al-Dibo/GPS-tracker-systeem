package com.gps.locationagent.util

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Platform-client (Phase 2): provisioning + GPS-zending tegen het
 * GPS Tracking Platform.
 *
 *  - enroll(): POST /api/trackers/enroll met de GEBRUIKERS-API-key →
 *    maakt de tracker automatisch aan en retourneert de eenmalige
 *    trackerKey (bewaar die lokaal; server kent alleen de hash).
 *  - sendGps(): POST /api/ingest met X-Tracker-Key — identiteit = de
 *    trackerKey, niet de naam.
 */
object PlatformClient {

    data class EnrollResult(
        val ok: Boolean,
        val trackerKey: String? = null,
        val trackerId: String? = null,
        val verificationStatus: String? = null,
        val error: String? = null,
        val httpStatus: Int? = null
    )

    data class SendResult(val ok: Boolean, val error: String? = null, val httpStatus: Int? = null)

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    private val JSON = "application/json; charset=utf-8".toMediaType()

    /** Eerste registratie (of herregistratie na reinstall) van deze installatie. */
    fun enroll(
        serverUrl: String,
        apiKey: String,
        installId: String,
        deviceName: String?,
        metadataJson: String
    ): EnrollResult {
        if (serverUrl.isBlank()) return EnrollResult(ok = false, error = "Server-URL ontbreekt")
        if (apiKey.isBlank()) return EnrollResult(ok = false, error = "API-key ontbreekt")
        try {
            val body = JSONObject().apply {
                put("installId", installId)
                if (!deviceName.isNullOrBlank()) put("deviceName", deviceName)
                val meta = parseMetadata(metadataJson)
                if (meta != null) put("metadata", meta)
            }
            val req = Request.Builder()
                .url("$serverUrl/api/trackers/enroll")
                .addHeader("X-API-Key", apiKey.trim())
                .post(body.toString().toRequestBody(JSON))
                .build()
            http.newCall(req).execute().use { res ->
                val text = res.body?.string().orEmpty()
                if (res.isSuccessful) {
                    val json = JSONObject(text)
                    return EnrollResult(
                        ok = true,
                        trackerKey = json.optString("trackerKey").ifBlank { null },
                        trackerId = json.optString("trackerId").ifBlank { null },
                        verificationStatus = json.optString("verificationStatus").ifBlank { null },
                        httpStatus = res.code
                    )
                }
                val err = runCatching { JSONObject(text).optString("error") }.getOrNull()
                    ?.takeIf { it.isNotBlank() }
                return EnrollResult(
                    ok = false,
                    error = err ?: "Registratie mislukt (HTTP ${res.code})",
                    httpStatus = res.code
                )
            }
        } catch (e: Exception) {
            return EnrollResult(ok = false, error = "Netwerkfout: ${e.message}")
        }
    }

    /**
     * Verstuurt één GPS-punt. `metadata` alleen meesturen als de app iets
     * gewijzigd heeft (de server past het dan toe; zie contract §4.3).
     */
    fun sendGps(
        serverUrl: String,
        trackerKey: String,
        payload: JSONObject
    ): SendResult {
        if (serverUrl.isBlank()) return SendResult(ok = false, error = "Server-URL ontbreekt")
        if (trackerKey.isBlank()) return SendResult(ok = false, error = "Tracker niet geregistreerd")
        try {
            val req = Request.Builder()
                .url("$serverUrl/api/ingest")
                .addHeader("X-Tracker-Key", trackerKey)
                .post(payload.toString().toRequestBody(JSON))
                .build()
            http.newCall(req).execute().use { res ->
                val text = res.body?.string().orEmpty()
                return if (res.isSuccessful) {
                    SendResult(ok = true, httpStatus = res.code)
                } else {
                    val err = runCatching { JSONObject(text).optString("error") }.getOrNull()
                        ?.takeIf { it.isNotBlank() }
                    // 4xx = permanent (bijv. ingetrokken) — niet zinvol om te bufferen;
                    // wel melden. 5xx/netwerk = bufferbaar.
                    SendResult(
                        ok = false,
                        error = err ?: "Versturen mislukt (HTTP ${res.code})",
                        httpStatus = res.code
                    )
                }
            }
        } catch (e: Exception) {
            return SendResult(ok = false, error = "Netwerkfout: ${e.message}")
        }
    }

    /** Bouwt de GPS-payload volgens het gedeelde platform-contract. */
    fun gpsPayload(
        installId: String,
        lat: Double,
        lon: Double,
        timestampMs: Long,
        speedMps: Float?,
        altitude: Double?,
        heading: Float?,
        accuracyMeters: Float?,
        batteryLevel: Int?,
        metadata: JSONObject?
    ): JSONObject = JSONObject().apply {
        put("installId", installId)
        put("latitude", lat)
        put("longitude", lon)
        put("timestamp", timestampMs)
        speedMps?.let { put("speedMps", it.toDouble()) }
        altitude?.let { put("altitude", it) }
        heading?.let { put("heading", it.toDouble()) }
        accuracyMeters?.let { put("accuracyMeters", it.toDouble()) }
        batteryLevel?.let { put("batteryLevel", it) }
        metadata?.let { put("metadata", it) }
    }

    /** Parse de lokale metadata-JSON string; leeg/ongeldig → null. */
    fun parseMetadata(metadataJson: String): JSONObject? {
        val trimmed = metadataJson.trim()
        if (trimmed.isEmpty() || trimmed == "{}") return null
        return try {
            val o = JSONObject(trimmed)
            if (o.length() == 0) null else o
        } catch (e: Exception) {
            null
        }
    }

    /** Eenvoudige, stabiele hash om "metadata gewijzigd?" te bepalen. */
    fun metadataHash(deviceName: String, metadataJson: String): String =
        "$deviceName|$metadataJson".hashCode().toString()
}
