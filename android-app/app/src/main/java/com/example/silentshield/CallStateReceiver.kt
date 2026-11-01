package com.example.silentshield

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.core.content.ContextCompat

class CallStateReceiver : BroadcastReceiver() {
    @RequiresApi(Build.VERSION_CODES.P)
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == TelephonyManager.ACTION_PHONE_STATE_CHANGED) {
            val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)
            val prefs = context.getSharedPreferences("shield_prefs", Context.MODE_PRIVATE)

            when (state) {
                TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                    // OFFHOOK means the call was just answered
                    if (prefs.getBoolean("drop_after_answer", false)) {
                        Log.d("SilentShield", "Call answered! Starting 5-second drop timer...")

                        // Clear the flag so we don't accidentally drop future legitimate calls
                        prefs.edit().putBoolean("drop_after_answer", false).apply()

                        Handler(Looper.getMainLooper()).postDelayed({
                            try {
                                val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
                                if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.ANSWER_PHONE_CALLS) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                                    @Suppress("DEPRECATION")
                                    val success = telecomManager.endCall()
                                    Log.d("SilentShield", "Live drop after answer executed! Success: $success")
                                } else {
                                    Log.e("SilentShield", "Missing permission for live drop")
                                }
                            } catch (e: Exception) {
                                Log.e("SilentShield", "Failed to live drop call", e)
                            }
                        }, 5000)
                    }
                }
                TelephonyManager.EXTRA_STATE_IDLE -> {
                    // IDLE means the call ended (or was missed). Clear the flag just in case.
                    prefs.edit().putBoolean("drop_after_answer", false).apply()
                }
            }
        }
    }
}
