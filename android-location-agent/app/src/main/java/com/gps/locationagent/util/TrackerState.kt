package com.gps.locationagent.util

/**
 * Gedeelde live-status tussen service en UI (geen IPC nodig voor een
 * enkele proces-grens). De vult de service; de Tracker-tab leest elke seconde.
 */
object TrackerState {
    @Volatile var lastLat: Double? = null
    @Volatile var lastLon: Double? = null
    @Volatile var lastAccuracy: Float? = null
    @Volatile var lastSpeed: Float? = null
    @Volatile var lastAltitude: Double? = null
    @Volatile var lastBearing: Float? = null
    @Volatile var lastFixAt: Long = 0L

    @Volatile var batteryLevel: Int? = null

    /** Laatste platform-zending: geslaagd? + tijdstip + foutmelding. */
    @Volatile var lastSendOk: Boolean? = null
    @Volatile var lastSendAt: Long = 0L
    @Volatile var lastError: String? = null

    /** Afgewachtte offline-punten in de Room-wachtrij. */
    @Volatile var pendingCount: Int = 0
}
