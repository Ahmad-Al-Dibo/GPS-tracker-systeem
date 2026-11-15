package com.gps.locationagent.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.gps.locationagent.LocationAgentApp
import com.gps.locationagent.data.ApiConfig
import com.gps.locationagent.data.LogEntry
import com.gps.locationagent.service.LocationShareService
import com.gps.locationagent.util.IntervalBounds
import com.gps.locationagent.util.SettingsStore
import com.gps.locationagent.util.TrackerState
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { }

    // Achtergrond-locatie vraagt Android 10+ los aan (apart dialog).
    private val bgLocationLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (!granted) {
            android.util.Log.w("LocationAgent", "ACCESS_BACKGROUND_LOCATION geweigerd")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestNeededPermissions()
        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AgentApp()
                }
            }
        }
    }

    private fun requestNeededPermissions() {
        val needed = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            needed += Manifest.permission.POST_NOTIFICATIONS
        }
        val missing = needed.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            permissionLauncher.launch(missing.toTypedArray())
        }
    }

    /** Achtergrond-toegang apart aanvragen (mag niet in dezelfde batch). */
    fun requestBackgroundLocation() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED
        ) {
            bgLocationLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        }
    }
}

// ---------- ViewModel ----------

class AgentViewModel(app: LocationAgentApp) : ViewModel() {
    val apis = app.database.apiConfigDao().observeAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val logs = app.database.logDao().observeRecent()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val settings = SettingsStore(app)

    private val db = app.database

    // ── Tracker-tab (Phase 2) ──
    val trackerName = settings.trackerName
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "")
    val trackerMetadata = settings.trackerMetadata
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "{}")
    val trackerKey = settings.trackerKey
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "")
    val trackerId = settings.trackerId
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "")
    val verification = settings.verificationStatus
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "")
    val platformServerUrl = settings.serverUrl
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "")
    val platformApiKey = settings.apiKey
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "")

    var installId by mutableStateOf("")
        private set
    var enrollBusy by mutableStateOf(false)
        private set
    var enrollMessage by mutableStateOf<String?>(null)
        private set
    var configSaved by mutableStateOf(false)
        private set

    init {
        viewModelScope.launch {
            installId = settings.ensureInstallId()
        }
    }

    /** Naam + metadata persisten; hash resetten zodat de volgende GPS-zending dit meestuurt. */
    fun saveTrackerConfig(name: String, metadataJson: String) = viewModelScope.launch {
        settings.setTrackerName(name)
        settings.setTrackerMetadata(metadataJson)
        settings.setLastMetadataHash(null)
        configSaved = true
    }

    fun enroll(serverUrl: String, apiKey: String, name: String, metadataJson: String) =
        viewModelScope.launch {
            enrollBusy = true
            enrollMessage = null
            try {
                val id = settings.ensureInstallId()
                val result = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    com.gps.locationagent.util.PlatformClient.enroll(
                        serverUrl = serverUrl,
                        apiKey = apiKey,
                        installId = id,
                        deviceName = name.trim().ifBlank { null },
                        metadataJson = metadataJson
                    )
                }
                if (result.ok && result.trackerKey != null) {
                    settings.setEnrollment(
                        result.trackerKey,
                        result.trackerId ?: "",
                        result.verificationStatus ?: "unverified"
                    )
                    settings.setLastMetadataHash(null)
                    enrollMessage =
                        "Geregistreerd ✓ — tracker wacht op verificatie door een beheerder."
                } else {
                    enrollMessage = result.error ?: "Registratie mislukt"
                }
            } catch (e: Exception) {
                enrollMessage = "Fout: ${e.message}"
            } finally {
                enrollBusy = false
            }
        }

    fun clearEnrollMessage() {
        enrollMessage = null
    }

    fun saveApi(config: ApiConfig) = viewModelScope.launch {
        try {
            if (config.id == 0L) {
                db.apiConfigDao().insert(config)
            } else {
                db.apiConfigDao().update(config)
            }
            // Log in terminal zodat zichtbaar is dat opslaan lukte
            db.logDao().insert(
                LogEntry(
                    level = "INFO",
                    apiName = config.name,
                    message = "API-config opgeslagen: ${config.url}"
                )
            )
        } catch (e: Exception) {
            db.logDao().insert(
                LogEntry(
                    level = "ERROR",
                    apiName = config.name,
                    message = "Opslaan mislukt: ${e.message}"
                )
            )
        }
    }

    fun deleteApi(config: ApiConfig) = viewModelScope.launch {
        db.apiConfigDao().delete(config)
    }

    fun toggleApi(config: ApiConfig) = viewModelScope.launch {
        db.apiConfigDao().setEnabled(config.id, !config.enabled)
    }

    fun setInterval(seconds: Long) = viewModelScope.launch {
        settings.setInterval(IntervalBounds.clamp(seconds))
    }

    fun setSharing(enabled: Boolean) = viewModelScope.launch {
        settings.setSharing(enabled)
    }

    fun clearLogs() = viewModelScope.launch {
        db.logDao().clear()
    }
}

class AgentViewModelFactory(private val app: LocationAgentApp) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T =
        AgentViewModel(app) as T
}

// ---------- UI ----------

sealed class Tab(val label: String) {
    data object Tracker : Tab("Tracker")
    data object Apis : Tab("API's")
    data object Status : Tab("Status")
    data object Terminal : Tab("Terminal")
}

@Composable
fun AgentApp() {
    val context = LocalContext.current
    val app = context.applicationContext as LocationAgentApp
    val vm: AgentViewModel = viewModel(factory = AgentViewModelFactory(app))
    var tab by remember { mutableStateOf<Tab>(Tab.Tracker) }
    var editing by remember { mutableStateOf<ApiConfig?>(null) }
    val sharing by vm.settings.sharingEnabled.collectAsState(initial = false)
    val interval by vm.settings.intervalSeconds.collectAsState(initial = 15L)
    val apis by vm.apis.collectAsState()
    val logs by vm.logs.collectAsState()

    fun toggleSharing(enabled: Boolean) {
        vm.setSharing(enabled)
        if (enabled) {
            ContextCompat.startForegroundService(
                context,
                Intent(context, LocationShareService::class.java)
            )
        } else {
            context.startService(
                Intent(context, LocationShareService::class.java)
                    .setAction(LocationShareService.ACTION_STOP)
            )
        }
    }

    Column(Modifier.fillMaxSize()) {
        // Tabs
        TabRow(selectedTabIndex = when (tab) {
            Tab.Tracker -> 0; Tab.Apis -> 1; Tab.Status -> 2; Tab.Terminal -> 3
        }) {
            listOf(Tab.Tracker, Tab.Apis, Tab.Status, Tab.Terminal).forEach { t ->
                Tab(
                    selected = tab == t,
                    onClick = { tab = t },
                    text = { Text(t.label) }
                )
            }
        }

        when (tab) {
            Tab.Tracker -> TrackerScreen(
                vm = vm,
                sharing = sharing,
                onToggleSharing = ::toggleSharing,
                onRequestBackground = {
                    (context as? MainActivity)?.requestBackgroundLocation()
                }
            )
            Tab.Apis -> ApisScreen(
                apis = apis,
                onAdd = { editing = ApiConfig(name = "", url = "https://") },
                onEdit = { editing = it },
                onToggle = { vm.toggleApi(it) },
                onDelete = { vm.deleteApi(it) }
            )
            Tab.Status -> StatusScreen(
                sharing = sharing,
                intervalSeconds = interval,
                onToggleSharing = ::toggleSharing,
                onIntervalChange = { vm.setInterval(it) }
            )
            Tab.Terminal -> TerminalScreen(
                logs = logs,
                onClear = { vm.clearLogs() }
            )
        }
    }

    editing?.let { config ->
        ApiEditDialog(
            initial = config,
            onSave = {
                vm.saveApi(it)
                editing = null
            },
            onDismiss = { editing = null }
        )
    }
}

// ---------- Tracker-tab (Phase 2): identiteit, metadata, status ----------

@Composable
fun TrackerScreen(
    vm: AgentViewModel,
    sharing: Boolean,
    onToggleSharing: (Boolean) -> Unit,
    onRequestBackground: () -> Unit
) {
    val context = LocalContext.current
    val trackerKey by vm.trackerKey.collectAsState()
    val trackerId by vm.trackerId.collectAsState()
    val verification by vm.verification.collectAsState()
    val savedName by vm.trackerName.collectAsState()
    val savedMetadata by vm.trackerMetadata.collectAsState()
    val serverUrl by vm.platformServerUrl.collectAsState()
    val apiKey by vm.platformApiKey.collectAsState()

    var name by remember(savedName) { mutableStateOf(savedName) }
    var metaFields by remember(savedMetadata) { mutableStateOf(parseMetaFields(savedMetadata)) }
    var enrollUrl by remember(serverUrl) { mutableStateOf(serverUrl) }
    var enrollKey by remember(apiKey) { mutableStateOf(apiKey) }
    var savedFlash by remember { mutableStateOf(false) }

    // Live status (1× per seconde verversen vanuit de gedeelde TrackerState).
    var tick by remember { mutableStateOf(0L) }
    LaunchedEffect(Unit) {
        while (true) {
            kotlinx.coroutines.delay(1000)
            tick = System.currentTimeMillis()
        }
    }

    val hasFine = ContextCompat.checkSelfPermission(
        context, Manifest.permission.ACCESS_FINE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED
    val hasBackground = ContextCompat.checkSelfPermission(
        context, Manifest.permission.ACCESS_BACKGROUND_LOCATION
    ) == PackageManager.PERMISSION_GRANTED

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // ── Registratiestatus ──
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Tracker", style = MaterialTheme.typography.titleMedium)
                if (trackerKey.isBlank()) {
                    Text(
                        "○ Niet geregistreerd — vul server-URL + API-key in en druk op Registreren.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall
                    )
                } else {
                    Text(
                        "● Geregistreerd ✓",
                        color = Color(0xFF4CAF50),
                        style = MaterialTheme.typography.titleSmall
                    )
                    Text(
                        "Status: ${if (verification == "verified") "Geverifieerd" else if (verification == "revoked") "Ingetrokken" else "Wacht op verificatie"}",
                        style = MaterialTheme.typography.bodySmall
                    )
                    if (trackerId.isNotBlank()) {
                        Text(
                            "Tracker-ID: ${trackerId.take(8)}…",
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                Text(
                    "Install-ID: ${vm.installId.take(13)}…",
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    "Deze ID is permanent (overleefde app-herstarts) en is je identiteit — " +
                        "niet je naam. Deel de API-key nooit publiek.",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // ── Live tracking-status ──
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    if (sharing) "● Tracking ACTIEF" else "○ Tracking gestopt",
                    color = if (sharing) Color(0xFF4CAF50) else MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.titleSmall
                )
                val lat = TrackerState.lastLat
                val lon = TrackerState.lastLon
                Text(
                    if (lat != null && lon != null)
                        "GPS: ${"%.5f".format(lat)}, ${"%.5f".format(lon)}" +
                            (TrackerState.lastAccuracy?.let { "  ±${it.toInt()} m" } ?: "")
                    else "GPS: wachten op fix…",
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace
                )
                Text(
                    buildString {
                        TrackerState.lastSpeed?.let { append(" · ${"%.1f".format(it * 3.6)} km/u") }
                        TrackerState.lastAltitude?.let { append(" · ${it.toInt()} m") }
                        TrackerState.batteryLevel?.let { append(" · 🔋${it}%") }
                    }.ifBlank { "—" },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                val lastOk = TrackerState.lastSendOk
                val pendingSuffix =
                    if (TrackerState.pendingCount > 0) " · ${TrackerState.pendingCount} gebufferd" else ""
                Text(
                    when {
                        TrackerState.lastSendAt == 0L -> "Nog niets naar het platform verzonden"
                        lastOk == true -> "Laatste verzending: ${ts(TrackerState.lastSendAt)} ✓$pendingSuffix"
                        else -> "Laatste verzending mislukt (${ts(TrackerState.lastSendAt)})$pendingSuffix"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = if (lastOk == false) Color(0xFFFFB74D) else MaterialTheme.colorScheme.onSurfaceVariant
                )
                TrackerState.lastError?.let {
                    Text("⚠ $it", fontSize = 11.sp, color = Color(0xFFFFB74D))
                }
                Button(
                    onClick = { onToggleSharing(!sharing) },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (sharing) Color(0xFFC62828) else Color(0xFF2E7D32)
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(if (sharing) "STOP tracking" else "START tracking")
                }
                if (!hasFine) {
                    Text(
                        "⚠ Locatietoegang geweigerd — sta locatie toe in de Android-instellingen.",
                        fontSize = 11.sp,
                        color = Color(0xFFEF5350)
                    )
                }
                if (hasFine && !hasBackground) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "Achtergrond-tracking beperkt door Android.",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedButton(onClick = onRequestBackground) {
                            Text("Toestaan", fontSize = 11.sp)
                        }
                    }
                }
            }
        }

        // ── Naam + metadata ──
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Naam & metadata", style = MaterialTheme.typography.titleSmall)
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it; savedFlash = false },
                    label = { Text("Tracker-naam (bijv. Company Van 01)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                KNOWN_META_FIELDS.forEach { (key, label) ->
                    OutlinedTextField(
                        value = metaFields.values[key] ?: "",
                        onValueChange = {
                            metaFields = metaFields.withValue(key, it)
                            savedFlash = false
                        },
                        label = { Text(label) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                if (metaFields.custom.isNotEmpty()) {
                    Text("Eigen velden", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                metaFields.custom.forEachIndexed { i, row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = row.first,
                            onValueChange = {
                                metaFields = metaFields.withCustom(i, it, row.second)
                                savedFlash = false
                            },
                            label = { Text("Sleutel") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = row.second,
                            onValueChange = {
                                metaFields = metaFields.withCustom(i, row.first, it)
                                savedFlash = false
                            },
                            label = { Text("Waarde") },
                            singleLine = true,
                            modifier = Modifier.weight(1.4f)
                        )
                        TextButton(onClick = {
                            metaFields = metaFields.withCustomRemoved(i)
                            savedFlash = false
                        }) { Text("✕") }
                    }
                }
                OutlinedButton(onClick = {
                    metaFields = metaFields.withCustomAdded("" to "")
                    savedFlash = false
                }) { Text("+ Eigen veld") }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = {
                        vm.saveTrackerConfig(name, metaFields.toJson())
                        savedFlash = true
                    }) { Text("Opslaan & syncen") }
                    if (savedFlash) {
                        Text(
                            "Opgeslagen — wijzigingen gaan mee met de volgende verzending.",
                            fontSize = 11.sp,
                            color = Color(0xFF4CAF50),
                            modifier = Modifier.align(Alignment.CenterVertically)
                        )
                    }
                }
            }
        }

        // ── Registratie / provisioning ──
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Registratie bij het platform", style = MaterialTheme.typography.titleSmall)
                OutlinedTextField(
                    value = enrollUrl,
                    onValueChange = { enrollUrl = it; vm.clearEnrollMessage() },
                    label = { Text("Server-URL (https://…)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = enrollKey,
                    onValueChange = { enrollKey = it; vm.clearEnrollMessage() },
                    label = { Text("API-key (gpta_… van het platform)") },
                    singleLine = true,
                    supportingText = { Text("Dashboard → API Keys. Alleen voor registratie.") },
                    modifier = Modifier.fillMaxWidth()
                )
                Button(
                    onClick = {
                        vm.saveTrackerConfig(name, metaFields.toJson())
                        vm.enroll(enrollUrl, enrollKey, name, metaFields.toJson())
                    },
                    enabled = !vm.enrollBusy,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(if (vm.enrollBusy) "Bezig met registreren…" else "Registreren / key vernieuwen")
                }
                vm.enrollMessage?.let {
                    Text(it, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (trackerKey.isNotBlank()) {
                    Text(
                        "Na registratie heeft de app een eigen tracker-key; die verstuurt elke " +
                            "GPS-zending. Een beheerder verifieert de tracker op het dashboard.",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

// ── Metadata-editor helpers (platte, eenvoudige structuur) ──

private val KNOWN_META_FIELDS = listOf(
    "vehicle_registration" to "Kenteken",
    "vehicle_type" to "Voertuigtype",
    "driver" to "Bestuurder",
    "company" to "Bedrijf",
    "department" to "Afdeling"
)

private data class MetaFields(
    val values: Map<String, String>,
    val custom: List<Pair<String, String>>
) {
    fun withValue(key: String, v: String) = copy(values = values + (key to v))
    fun withCustom(i: Int, k: String, v: String) =
        copy(custom = custom.toMutableList().also { it[i] = k to v })
    fun withCustomRemoved(i: Int) = copy(custom = custom.filterIndexed { j, _ -> j != i })
    fun withCustomAdded(row: Pair<String, String>) = copy(custom = custom + row)

    fun toJson(): String {
        val o = org.json.JSONObject()
        values.forEach { (k, v) -> if (v.isNotBlank()) o.put(k, v) }
        if (custom.any { it.first.isNotBlank() && it.second.isNotBlank() }) {
            val c = org.json.JSONObject()
            custom.forEach { (k, v) -> if (k.isNotBlank() && v.isNotBlank()) c.put(k, v) }
            o.put("customFields", c)
        }
        return o.toString()
    }
}

private fun parseMetaFields(json: String): MetaFields {
    val values = KNOWN_META_FIELDS.associate { (k, _) -> k to "" }.toMutableMap()
    val custom = mutableListOf<Pair<String, String>>()
    try {
        val o = org.json.JSONObject(json.ifBlank { "{}" })
        KNOWN_META_FIELDS.forEach { (k, _) ->
            if (o.has(k)) values[k] = o.optString(k)
        }
        val c = o.optJSONObject("customFields")
        if (c != null) {
            for (key in c.keys()) custom.add(key to c.optString(key))
        }
    } catch (_: Exception) {
    }
    return MetaFields(values, custom)
}

@Composable
fun ApisScreen(
    apis: List<ApiConfig>,
    onAdd: () -> Unit,
    onEdit: (ApiConfig) -> Unit,
    onToggle: (ApiConfig) -> Unit,
    onDelete: (ApiConfig) -> Unit
) {
    Column(Modifier.fillMaxSize().padding(12.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("API-configuraties", style = MaterialTheme.typography.titleMedium)
            Button(onClick = onAdd) { Text("+ API") }
        }
        Spacer(Modifier.height(8.dp))
        if (apis.isEmpty()) {
            Text(
                "Nog geen API's. Klik op + API om er één toe te voegen.",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(apis, key = { it.id }) { api ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(api.name, style = MaterialTheme.typography.titleSmall)
                                Text(
                                    api.url,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(
                                    "${api.httpMethod} · ${if (api.enabled) "aan" else "uit"}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (api.enabled) Color(0xFF4CAF50) else Color(0xFFFF9800)
                                )
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { onToggle(api) }) {
                                Text(if (api.enabled) "Uitzetten" else "Aanzetten")
                            }
                            OutlinedButton(onClick = { onEdit(api) }) { Text("Bewerken") }
                            OutlinedButton(onClick = { onDelete(api) }) { Text("Verwijderen") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ApiEditDialog(
    initial: ApiConfig,
    onSave: (ApiConfig) -> Unit,
    onDismiss: () -> Unit
) {
    var name by remember { mutableStateOf(initial.name) }
    var url by remember { mutableStateOf(initial.url) }
    var apiKey by remember { mutableStateOf(initial.apiKey) }
    var method by remember { mutableStateOf(initial.httpMethod) }
    var headers by remember { mutableStateOf(initial.headersRaw) }
    var body by remember { mutableStateOf(initial.bodyTemplate) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial.id == 0L) "Nieuwe API" else "API bewerken") },
        text = {
            Column(
                Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Naam") })
                OutlinedTextField(value = url, onValueChange = { url = it }, label = { Text("URL") })
                OutlinedTextField(
                    value = apiKey,
                    onValueChange = { apiKey = it },
                    label = { Text("API-key (X-API-Key)") },
                    supportingText = { Text("Van het GPS-platform: dashboard → API-keys") },
                    singleLine = true
                )
                OutlinedTextField(
                    value = method,
                    onValueChange = { method = it },
                    label = { Text("Methode (POST/PUT/PATCH)") }
                )
                OutlinedTextField(
                    value = headers,
                    onValueChange = { headers = it },
                    label = { Text("Headers (Key: Value per regel)") },
                    minLines = 2
                )
                OutlinedTextField(
                    value = body,
                    onValueChange = { body = it },
                    label = { Text("Body-template (leeg = standaard JSON)") },
                    supportingText = {
                        Text("{latitude} {longitude} {accuracy} {sampledAt} {receivedAt}")
                    },
                    minLines = 3
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (name.isNotBlank() && url.isNotBlank()) {
                        onSave(
                            initial.copy(
                                name = name.trim(),
                                url = url.trim(),
                                apiKey = apiKey.trim(),
                                httpMethod = method.trim().ifBlank { "POST" },
                                headersRaw = headers,
                                bodyTemplate = body,
                                updatedAt = System.currentTimeMillis()
                            )
                        )
                    }
                }
            ) { Text("Opslaan") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Annuleren") }
        }
    )
}

@Composable
fun StatusScreen(
    sharing: Boolean,
    intervalSeconds: Long,
    onToggleSharing: (Boolean) -> Unit,
    onIntervalChange: (Long) -> Unit
) {
    Column(
        Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Status", style = MaterialTheme.typography.titleMedium)

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    if (sharing) "● Locatie delen ACTIEF" else "○ Locatie delen gestopt",
                    color = if (sharing) Color(0xFF4CAF50) else MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.titleSmall
                )
                Button(
                    onClick = { onToggleSharing(!sharing) },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (sharing) Color(0xFFC62828) else Color(0xFF2E7D32)
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(if (sharing) "STOP delen" else "START delen")
                }
            }
        }

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Verzendfrequentie", style = MaterialTheme.typography.titleSmall)
                Text(
                    "Elke ${formatInterval(intervalSeconds)} (min 5s · max 1 maand)",
                    style = MaterialTheme.typography.bodySmall
                )
                IntervalPicker(
                    seconds = intervalSeconds,
                    onChange = onIntervalChange
                )
            }
        }

        Text(
            "Deellocatie werkt zolang de app/service actief is en permissies zijn verleend. " +
                "Achtergrond-GPS hangt af van OS-instellingen.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
fun IntervalPicker(seconds: Long, onChange: (Long) -> Unit) {
    val presets = listOf(
        5L to "5s", 15L to "15s", 30L to "30s", 60L to "1m",
        5 * 60L to "5m", 15 * 60L to "15m", 30 * 60L to "30m",
        3600L to "1u", 6 * 3600L to "6u", 24 * 3600L to "24u"
    )
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
            presets.forEach { (sec, label) ->
                FilterChip(
                    selected = seconds == sec,
                    onClick = { onChange(sec) },
                    label = { Text(label) }
                )
            }
        }
        var custom by remember(seconds) { mutableStateOf(seconds.toString()) }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = custom,
                onValueChange = { custom = it },
                modifier = Modifier.width(140.dp),
                label = { Text("Seconden") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true
            )
            Button(
                onClick = {
                    custom.toLongOrNull()?.let { onChange(IntervalBounds.clamp(it)) }
                }
            ) { Text("Toepassen") }
        }
    }
}

@Composable
fun TerminalScreen(logs: List<LogEntry>, onClear: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(12.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("API-terminal", style = MaterialTheme.typography.titleMedium)
            OutlinedButton(onClick = onClear) { Text("Wissen") }
        }
        Spacer(Modifier.height(8.dp))
        if (logs.isEmpty()) {
            Text(
                "Nog geen berichten. Start delen om requests/responses te zien.",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        } else {
            LazyColumn(
                Modifier
                    .fillMaxSize()
                    .background(Color(0xFF121212))
                    .padding(8.dp)
            ) {
                items(logs) { entry ->
                    val color = when (entry.level) {
                        "ERROR" -> Color(0xFFEF5350)
                        "WARN" -> Color(0xFFFFB74D)
                        "HTTP" -> Color(0xFF81C784)
                        else -> Color(0xFF90CAF9)
                    }
                    Text(
                        text = "[${ts(entry.timestamp)}] ${entry.level} ${entry.apiName}: ${entry.message}",
                        color = color,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier.padding(vertical = 1.dp)
                    )
                }
            }
        }
    }
}

private fun ts(millis: Long): String {
    val sdf = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault())
    return sdf.format(java.util.Date(millis))
}

fun formatInterval(seconds: Long): String = when {
    seconds < 60 -> "$seconds seconden"
    seconds < 3600 -> "${seconds / 60} minuten"
    seconds < 86400 -> "${seconds / 3600} uur"
    else -> "${seconds / 86400} dagen"
}
