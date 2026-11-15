package com.gps.locationagent.util

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.util.UUID

private val Context.dataStore by preferencesDataStore(name = "settings")

/** Min 5 seconden, max 1 maand (30 dagen) in seconden. */
object IntervalBounds {
    const val MIN_SECONDS = 5L
    const val MAX_SECONDS = 30L * 24L * 60L * 60L // 2_592_000
    fun clamp(seconds: Long): Long = seconds.coerceIn(MIN_SECONDS, MAX_SECONDS)
}

class SettingsStore(private val context: Context) {
    private val keyInterval = longPreferencesKey("send_interval_seconds")
    private val keySharing = booleanPreferencesKey("sharing_enabled")
    private val keyApiKey = stringPreferencesKey("api_key")
    private val keyServerUrl = stringPreferencesKey("server_url")
    // ── Tracker-identiteit (Phase 2) ──
    private val keyInstallId = stringPreferencesKey("install_id")
    private val keyTrackerName = stringPreferencesKey("tracker_name")
    private val keyTrackerMetadata = stringPreferencesKey("tracker_metadata")
    private val keyTrackerKey = stringPreferencesKey("tracker_key")
    private val keyTrackerId = stringPreferencesKey("tracker_id")
    private val keyVerification = stringPreferencesKey("tracker_verification")
    private val keyLastMetaHash = stringPreferencesKey("last_metadata_hash")

    val intervalSeconds: Flow<Long> = context.dataStore.data
        .map { it[keyInterval] ?: 15L }

    val sharingEnabled: Flow<Boolean> = context.dataStore.data
        .map { it[keySharing] ?: false }

    val apiKey: Flow<String> = context.dataStore.data
        .map { it[keyApiKey] ?: "" }

    val serverUrl: Flow<String> = context.dataStore.data
        .map { it[keyServerUrl] ?: "" }

    val trackerName: Flow<String> = context.dataStore.data
        .map { it[keyTrackerName] ?: "" }

    /** JSON-string met apparaat-metadata (custom key-value). */
    val trackerMetadata: Flow<String> = context.dataStore.data
        .map { it[keyTrackerMetadata] ?: "{}" }

    val trackerKey: Flow<String> = context.dataStore.data
        .map { it[keyTrackerKey] ?: "" }

    val trackerId: Flow<String> = context.dataStore.data
        .map { it[keyTrackerId] ?: "" }

    val verificationStatus: Flow<String> = context.dataStore.data
        .map { it[keyVerification] ?: "" }

    suspend fun setInterval(seconds: Long) {
        context.dataStore.edit { it[keyInterval] = IntervalBounds.clamp(seconds) }
    }

    suspend fun setSharing(enabled: Boolean) {
        context.dataStore.edit { it[keySharing] = enabled }
    }

    suspend fun setApiKey(key: String) {
        context.dataStore.edit { it[keyApiKey] = key.trim() }
    }

    suspend fun setServerUrl(url: String) {
        context.dataStore.edit { it[keyServerUrl] = url.trim().trimEnd('/') }
    }

    suspend fun setTrackerName(name: String) {
        context.dataStore.edit { it[keyTrackerName] = name.trim() }
    }

    suspend fun setTrackerMetadata(json: String) {
        context.dataStore.edit { it[keyTrackerMetadata] = json.ifBlank { "{}" } }
    }

    suspend fun setEnrollment(trackerKey: String, trackerId: String, verification: String) {
        context.dataStore.edit {
            it[keyTrackerKey] = trackerKey
            it[keyTrackerId] = trackerId
            it[keyVerification] = verification
        }
    }

    suspend fun setVerificationStatus(status: String) {
        context.dataStore.edit { it[keyVerification] = status }
    }

    suspend fun setLastMetadataHash(hash: String?) {
        context.dataStore.edit {
            if (hash == null) it.remove(keyLastMetaHash) else it[keyLastMetaHash] = hash
        }
    }

    suspend fun lastMetadataHash(): String =
        context.dataStore.data.first()[keyLastMetaHash] ?: ""

    /**
     * Persistent install-ID: gegenereerd bij ALLEREERSTE gebruik en daarna
     * bewaard — stabiele tracker-identiteit over app-herstarts heen
     * (Phase 2 §4.1). Nooit opnieuw genereren bij een gewone start.
     */
    suspend fun ensureInstallId(): String {
        val existing = context.dataStore.data.first()[keyInstallId]
        if (!existing.isNullOrBlank()) return existing
        val generated = UUID.randomUUID().toString()
        context.dataStore.edit { it[keyInstallId] = generated }
        return generated
    }

    suspend fun currentInterval(): Long =
        intervalSeconds.first()

    suspend fun currentApiKey(): String =
        apiKey.first()

    suspend fun currentServerUrl(): String =
        serverUrl.first()

    suspend fun currentInstallId(): String =
        ensureInstallId()

    suspend fun currentTrackerKey(): String =
        trackerKey.first()

    suspend fun currentTrackerName(): String =
        trackerName.first()

    suspend fun currentTrackerMetadata(): String =
        trackerMetadata.first()
}
