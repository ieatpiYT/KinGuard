package com.example.silentshield

import android.Manifest
import android.app.role.RoleManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.RequiresApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.example.silentshield.ui.theme.KinGuardTheme
import java.util.concurrent.TimeUnit

class MainActivity : ComponentActivity() {
    @RequiresApi(Build.VERSION_CODES.Q)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            KinGuardTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFF6C8B63)
                ) {
                    KinGuardScreen()
                }
            }
        }
    }
}

@RequiresApi(Build.VERSION_CODES.Q)
@Composable
fun KinGuardScreen() {
    val context = LocalContext.current
    val roleManager = context.getSystemService(Context.ROLE_SERVICE) as RoleManager
    val prefs = context.getSharedPreferences("shield_prefs", Context.MODE_PRIVATE)

    var systemRoleHeld by remember { mutableStateOf(roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) }
    var demoDeactivated by remember { mutableStateOf(prefs.getBoolean("demo_deactivated", false)) }

    val isProtectionActive = systemRoleHeld && !demoDeactivated
    var notifyBlocked by remember { mutableStateOf(prefs.getBoolean("notify_blocked", false)) }

    fun startContactsSync() {
        val periodicRequest = PeriodicWorkRequestBuilder<ContactsSyncWorker>(12, TimeUnit.HOURS).build()
        val oneTimeRequest = OneTimeWorkRequestBuilder<ContactsSyncWorker>().build()
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
        systemRoleHeld = roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)
        demoDeactivated = false
        prefs.edit().putBoolean("demo_deactivated", false).apply()
        if (systemRoleHeld) {
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

        if (systemRoleHeld) {
            startContactsSync()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF6C8B63))
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // App Logo
        Image(
            painter = painterResource(id = R.drawable.kinguard_logo),
            contentDescription = "KinGuard Logo",
            modifier = Modifier
                .size(200.dp)
                .clip(RoundedCornerShape(32.dp))
        )

        Spacer(modifier = Modifier.height(28.dp))

        if (isProtectionActive) {
            Box(
                modifier = Modifier
                    .background(Color(0xFF1E4620), RoundedCornerShape(20.dp))
                    .padding(24.dp)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Protection Active\n(Zero-UI Mode)",
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0x33000000)),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Send Blocked Notifications",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color.White
                    )
                    Switch(
                        checked = notifyBlocked,
                        onCheckedChange = {
                            notifyBlocked = it
                            prefs.edit().putBoolean("notify_blocked", it).apply()
                        },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color.White,
                            checkedTrackColor = Color(0xFF1E4620)
                        )
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Disable Protection Action (Instantly switches to Inactive state for seamless setup demos)
            Button(
                onClick = {
                    demoDeactivated = true
                    prefs.edit().putBoolean("demo_deactivated", true).apply()
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2C3E2D)),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
            ) {
                Text(
                    text = "Disable Protection",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }
        } else {
            Box(
                modifier = Modifier
                    .background(Color(0xFFB71C1C), RoundedCornerShape(20.dp))
                    .padding(24.dp)
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

            Spacer(modifier = Modifier.height(32.dp))

            Button(
                onClick = {
                    demoDeactivated = false
                    prefs.edit().putBoolean("demo_deactivated", false).apply()
                    val intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING)
                    roleLauncher.launch(intent)
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E4620)),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp)
            ) {
                Text(
                    text = "Enable KinGuard Protection",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }
        }
    }
}
