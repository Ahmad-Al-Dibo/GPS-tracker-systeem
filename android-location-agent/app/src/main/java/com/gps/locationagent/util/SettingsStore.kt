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

    val intervalSeconds: Flow<Long> = context.dataStore.data
        .map { it[keyInterval] ?: 15L }

    val sharingEnabled: Flow<Boolean> = context.dataStore.data
        .map { it[keySharing] ?: false }

    val apiKey: Flow<String> = context.dataStore.data
        .map { it[keyApiKey] ?: "" }

    val serverUrl: Flow<String> = context.dataStore.data
        .map { it[keyServerUrl] ?: "" }

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

    suspend fun currentInterval(): Long =
        intervalSeconds.first()

    suspend fun currentApiKey(): String =
        apiKey.first()

    suspend fun currentServerUrl(): String =
        serverUrl.first()
}
