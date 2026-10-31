package com.gps.locationagent.data

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Eén geconfigureerde API waar naartoe locatie mag worden gestuurd.
 * Bewaart URL, API-key, optionele headers/body en of deze API actief is.
 */
@Entity(tableName = "api_configs")
data class ApiConfig(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val url: String,
    /** API-key van het GPS-platform (header X-API-Key). */
    val apiKey: String = "",
    /** Extra headers als "Key: Value", één per newline. */
    val headersRaw: String = "",
    /** Optionele body-template. Leeg = standaard JSON-payload. */
    val bodyTemplate: String = "",
    val httpMethod: String = "POST",
    val enabled: Boolean = true,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)

/**
 * Logregel voor de terminal-weergave (request/response/fout).
 */
@Entity(tableName = "log_entries")
data class LogEntry(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val timestamp: Long = System.currentTimeMillis(),
    val level: String, // INFO, WARN, ERROR, HTTP
    val apiName: String,
    val message: String
)
