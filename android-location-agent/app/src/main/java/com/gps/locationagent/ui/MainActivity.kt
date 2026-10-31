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
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { }

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
}

// ---------- ViewModel ----------

class AgentViewModel(app: LocationAgentApp) : ViewModel() {
    val apis = app.database.apiConfigDao().observeAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val logs = app.database.logDao().observeRecent()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val settings = SettingsStore(app)

    private val db = app.database

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
    data object Apis : Tab("API's")
    data object Status : Tab("Status")
    data object Terminal : Tab("Terminal")
}

@Composable
fun AgentApp() {
    val context = LocalContext.current
    val app = context.applicationContext as LocationAgentApp
    val vm: AgentViewModel = viewModel(factory = AgentViewModelFactory(app))
    var tab by remember { mutableStateOf<Tab>(Tab.Apis) }
    var editing by remember { mutableStateOf<ApiConfig?>(null) }
    val sharing by vm.settings.sharingEnabled.collectAsState(initial = false)
    val interval by vm.settings.intervalSeconds.collectAsState(initial = 15L)
    val apis by vm.apis.collectAsState()
    val logs by vm.logs.collectAsState()

    Column(Modifier.fillMaxSize()) {
        // Tabs
        TabRow(selectedTabIndex = when (tab) {
            Tab.Apis -> 0; Tab.Status -> 1; Tab.Terminal -> 2
        }) {
            listOf(Tab.Apis, Tab.Status, Tab.Terminal).forEach { t ->
                Tab(
                    selected = tab == t,
                    onClick = { tab = t },
                    text = { Text(t.label) }
                )
            }
        }

        when (tab) {
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
                onToggleSharing = { enabled ->
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
                },
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
