package com.gps.locationagent

import android.app.Application
import com.gps.locationagent.data.AppDatabase

class LocationAgentApp : Application() {
    val database: AppDatabase by lazy { AppDatabase.get(this) }
}
