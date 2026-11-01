package com.example.silentshield

import android.Manifest
import android.app.role.RoleManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.RequiresApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.example.silentshield.ui.theme.SilentShieldTheme
import java.util.concurrent.TimeUnit

class MainActivity : ComponentActivity() {
    @RequiresApi(Build.VERSION_CODES.Q)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SilentShieldTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    SilentShieldScreen(modifier = Modifier.padding(innerPadding))
                }
            }
        }
    }
}

@RequiresApi(Build.VERSION_CODES.Q)
@Composable
fun SilentShieldScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val roleManager = context.getSystemService(Context.ROLE_SERVICE) as RoleManager
    val prefs = context.getSharedPreferences("shield_prefs", Context.MODE_PRIVATE)

    var isRoleHeld by remember { mutableStateOf(roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) }
    var notifyBlocked by remember { mutableStateOf(prefs.getBoolean("notify_blocked", false)) }

    fun startContactsSync() {
        val periodicRequest = PeriodicWorkRequestBuilder<ContactsSyncWorker>(12, TimeUnit.HOURS).build()
        val oneTimeRequest = androidx.work.OneTimeWorkRequestBuilder<ContactsSyncWorker>().build()
        val workManager = WorkManager.getInstance(context)
        workManager.enqueue(oneTimeRequest)
        workManager.enqueueUniquePeriodicWork(
            "SyncContacts",
            ExistingPeriodicWorkPolicy.KEEP,
            periodicRequest
        )
    }

    val roleLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) {
        isRoleHeld = roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)
        if (isRoleHeld) {
            startContactsSync()
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions[Manifest.permission.READ_CONTACTS] == true) {
            startContactsSync()
        }
    }

    LaunchedEffect(Unit) {
        val permissions = mutableListOf(
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.ANSWER_PHONE_CALLS
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        permissionLauncher.launch(permissions.toTypedArray())

        if (isRoleHeld) {
            startContactsSync()
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "KinGuard",
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(24.dp))

        if (isRoleHeld) {
            Box(
                modifier = Modifier
                    .background(Color(0xFF4CAF50), RoundedCornerShape(16.dp))
                    .padding(32.dp)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "KinGuard Active\n(Zero-UI Mode)",
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )
            }

            Spacer(modifier = Modifier.height(32.dp))

            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("Send Blocked Notifications", fontSize = 16.sp, fontWeight = FontWeight.Medium)
                Switch(
                    checked = notifyBlocked,
                    onCheckedChange = {
                        notifyBlocked = it
                        prefs.edit().putBoolean("notify_blocked", it).apply()
                    }
                )
            }

            Spacer(modifier = Modifier.height(32.dp))

            Button(
                onClick = {
                    try {
                        val intent = Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS)
                        context.startActivity(intent)
                    } catch (e: ActivityNotFoundException) {
                        try {
                            val intent = Intent(Settings.ACTION_SETTINGS)
                            context.startActivity(intent)
                        } catch (e2: Exception) {
                            Toast.makeText(context, "Unable to open settings", Toast.LENGTH_SHORT).show()
                        }
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color.DarkGray),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
            ) {
                Text(text = "Disable Protection", fontSize = 16.sp)
            }
        } else {
            Box(
                modifier = Modifier
                    .background(Color(0xFFF44336), RoundedCornerShape(16.dp))
                    .padding(32.dp)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Protection Inactive",
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )
            }

            Spacer(modifier = Modifier.height(48.dp))

            Button(
                onClick = {
                    val intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)
                    roleLauncher.launch(intent)
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp)
            ) {
                Text(text = "Enable KinGuard Protection", fontSize = 18.sp)
            }
        }
    }
}
