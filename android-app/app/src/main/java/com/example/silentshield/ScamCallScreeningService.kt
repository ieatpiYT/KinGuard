package com.example.silentshield

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.ContactsContract
import android.telecom.Call
import android.telecom.CallScreeningService
import android.telecom.Connection
import android.util.Log
import androidx.annotation.RequiresApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

@RequiresApi(Build.VERSION_CODES.R)
class ScamCallScreeningService : CallScreeningService() {

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(3500, TimeUnit.MILLISECONDS)
        .readTimeout(3500, TimeUnit.MILLISECONDS)
        .writeTimeout(3500, TimeUnit.MILLISECONDS)
        .build()

    private fun normalizeTenDigits(raw: String): String {
        val digits = raw.replace(Regex("[^0-9]"), "")
        return if (digits.length == 11 && digits.startsWith("1")) {
            digits.substring(1)
        } else {
            digits
        }
    }

    private fun formatE164(rawNumber: String, tenDigitNumber: String): String {
        return when {
            tenDigitNumber.length == 10 -> "+1$tenDigitNumber"
            rawNumber.startsWith("+") -> rawNumber
            tenDigitNumber.isNotEmpty() -> "+$tenDigitNumber"
            else -> rawNumber
        }
    }

    private fun isNumberInContacts(context: Context, phoneNumber: String): Boolean {
        if (phoneNumber.isEmpty()) return false
        val uri = Uri.withAppendedPath(
            ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
            Uri.encode(phoneNumber)
        )
        try {
            context.contentResolver.query(
                uri,
                arrayOf(ContactsContract.PhoneLookup.NUMBER),
                null,
                null,
                null
            )?.use { cursor ->
                return cursor.moveToFirst()
            }
        } catch (e: Exception) {
            Log.e("KinGuard", "Error checking contacts", e)
        }
        return false
    }

    override fun onScreenCall(callDetails: Call.Details) {
        if (callDetails.callDirection != Call.Details.DIRECTION_INCOMING) {
            applyCallAction(callDetails, "allow")
            return
        }

        val prefs = getSharedPreferences("shield_prefs", Context.MODE_PRIVATE)
        // Reset stale drop-after-answer demo flags on every new incoming call
        prefs.edit().putBoolean("drop_after_answer", false).apply()

        if (prefs.getBoolean("demo_deactivated", false)) {
            Log.d("KinGuard", "Protection disabled in UI (demo_deactivated=true) — allowing call unscreened")
            applyCallAction(callDetails, "allow")
            return
        }

        val rawNumber = callDetails.handle?.schemeSpecificPart ?: ""

        // 1. Deterministic Contacts Book Passthrough (0ms)
        if (isNumberInContacts(this, rawNumber)) {
            Log.d("KinGuard", "Allowed: Number in device contacts")
            applyCallAction(callDetails, "allow")
            return
        }

        val normalizedNumber = rawNumber.replace(Regex("[^0-9+]"), "")
        val tenDigitNumber = normalizeTenDigits(rawNumber)
        val verificationStatus = callDetails.callerNumberVerificationStatus

        Log.d("KinGuard", "Incoming call from: $rawNumber (norm=$tenDigitNumber), STIR/SHAKEN: $verificationStatus")

        // Check synced contacts whitelist
        val contactsWhitelist = prefs.getStringSet("whitelist", emptySet()) ?: emptySet()
        if (normalizedNumber.isNotEmpty() &&
            (contactsWhitelist.contains(normalizedNumber) || contactsWhitelist.contains(tenDigitNumber))
        ) {
            Log.d("KinGuard", "Allowed: In contacts whitelist")
            applyCallAction(callDetails, "allow")
            return
        }

        val cachePrefs = getSharedPreferences("recent_calls", Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val lastCallTime = cachePrefs.getLong(tenDigitNumber.ifEmpty { normalizedNumber }, 0)
        val isRepeatCaller = (now - lastCallTime) < (5 * 60 * 1000)

        // Update repeat-caller timestamp cache
        cachePrefs.edit().putLong(tenDigitNumber.ifEmpty { normalizedNumber }, now).apply()

        // 2. Query Backend / Dashboard Bridge (with fast timeout & offline fallback)
        CoroutineScope(Dispatchers.IO).launch {
            val backendAction = evaluateWithBackend(
                rawNumber = rawNumber,
                tenDigitNumber = tenDigitNumber,
                verificationStatus = verificationStatus,
                isRepeatCaller = isRepeatCaller
            )

            val finalAction = backendAction ?: evaluateLocally(
                tenDigitNumber = tenDigitNumber,
                normalizedNumber = normalizedNumber,
                isRepeatCaller = isRepeatCaller
            )

            withContext(Dispatchers.Main) {
                if (finalAction == "drop_after_answer") {
                    Log.d("KinGuard", "Allowed initially, flagged for drop 5 seconds after answering...")
                    prefs.edit().putBoolean("drop_after_answer", true).apply()
                    applyCallAction(callDetails, "allow")
                } else {
                    if (finalAction == "reject") {
                        val notify = prefs.getBoolean("notify_blocked", false)
                        if (notify) {
                            sendNotification(rawNumber)
                        }
                    }
                    applyCallAction(callDetails, finalAction)
                }
            }
        }
    }

    private fun evaluateWithBackend(
        rawNumber: String,
        tenDigitNumber: String,
        verificationStatus: Int,
        isRepeatCaller: Boolean
    ): String? {
        val savedContacts = getSharedPreferences("shield_prefs", Context.MODE_PRIVATE)
            .getStringSet("whitelist", emptySet()) ?: emptySet()

        val e164Number = formatE164(rawNumber, tenDigitNumber)
        // Android Emulator GSM calls always report VERIFICATION_STATUS_NOT_VERIFIED (0).
        // Map unknown unverified emulator calls to "FAILED" so Python's Groq LLM and rule fallback
        // treat unknown incoming emulator calls as suspicious rather than verified domestic numbers.
        val verificationStatusStr = when (verificationStatus) {
            Connection.VERIFICATION_STATUS_PASSED -> "PASSED"
            Connection.VERIFICATION_STATUS_FAILED -> "FAILED"
            else -> "FAILED"
        }

        val payload = JSONObject().apply {
            // Python Flask backend contract keys (python-backend/app.py)
            put("caller_id", e164Number)
            put("verification_status", verificationStatusStr)
            put("call_direction", "INCOMING")
            put("timestamp", (System.currentTimeMillis() / 1000L))
            // Vite bridge & Android metadata keys
            put("number", rawNumber)
            put("normalized", tenDigitNumber)
            put("verificationStatus", verificationStatus)
            put("isRepeatCaller", isRepeatCaller)
            put("contacts", JSONArray(savedContacts.toList()))
        }.toString()

        val mediaType = "application/json; charset=utf-8".toMediaType()
        // 1. Vite Dashboard Bridge (port 5173, which proxies to Python :5001 and syncs UI + ADB)
        // 2. Direct Python Flask server (port 5001)
        val endpoints = listOf(
            "http://10.0.2.2:5173/evaluate",
            "http://10.0.2.2:5001/evaluate"
        )

        for (url in endpoints) {
            try {
                val request = Request.Builder()
                    .url(url)
                    .post(payload.toRequestBody(mediaType))
                    .build()

                httpClient.newCall(request).execute().use { response ->
                    if (response.isSuccessful) {
                        val bodyStr = response.body?.string() ?: return@use
                        val json = JSONObject(bodyStr)

                        // Sync caregiver whitelist & 24h TTL blacklist to local SharedPreferences for offline safety
                        syncListsFromBackend(json)

                        val action = json.optString("action", "")
                        if (action.isNotEmpty()) {
                            Log.d("KinGuard", "Backend ($url) returned action: $action")
                            return action
                        }
                    }
                }
            } catch (e: Exception) {
                Log.d("KinGuard", "Endpoint $url unreachable, trying fallback...")
            }
        }
        return null
    }

    private fun syncListsFromBackend(json: JSONObject) {
        if (json.optBoolean("clearRecentCache", false)) {
            getSharedPreferences("recent_calls", Context.MODE_PRIVATE).edit().clear().apply()
            Log.d("KinGuard", "Cleared local recent_calls 5-minute cache per server reset")
        }

        val prefs = getSharedPreferences("shield_prefs", Context.MODE_PRIVATE)
        val editor = prefs.edit()

        json.optJSONArray("whitelist")?.let { arr ->
            val set = mutableSetOf<String>()
            for (i in 0 until arr.length()) {
                val item = normalizeTenDigits(arr.optString(i))
                if (item.isNotEmpty()) set.add(item)
            }
            editor.putStringSet("caregiver_whitelist", set)
        }

        json.optJSONArray("blacklist")?.let { arr ->
            val set = mutableSetOf<String>()
            val ttlPrefs = getSharedPreferences("blacklist_ttl", Context.MODE_PRIVATE).edit()
            val expiry = System.currentTimeMillis() + (24 * 60 * 60 * 1000L) // 24-hour TTL
            for (i in 0 until arr.length()) {
                val item = normalizeTenDigits(arr.optString(i))
                if (item.isNotEmpty()) {
                    set.add(item)
                    ttlPrefs.putLong(item, expiry)
                }
            }
            ttlPrefs.apply()
            editor.putStringSet("caregiver_blacklist", set)
        }

        editor.apply()
    }

    private fun evaluateLocally(
        tenDigitNumber: String,
        normalizedNumber: String,
        isRepeatCaller: Boolean
    ): String {
        val prefs = getSharedPreferences("shield_prefs", Context.MODE_PRIVATE)

        // 1. Check cached Caregiver Whitelist
        val caregiverWhitelist = prefs.getStringSet("caregiver_whitelist", emptySet()) ?: emptySet()
        if (tenDigitNumber.isNotEmpty() && caregiverWhitelist.contains(tenDigitNumber)) {
            Log.d("KinGuard", "Allowed (Offline): In caregiver whitelist")
            return "allow"
        }

        // 2. Check 24-Hour TTL Blacklist Cache + hardcoded 9999 demo suffix
        val ttlPrefs = getSharedPreferences("blacklist_ttl", Context.MODE_PRIVATE)
        val blacklistExpiry = ttlPrefs.getLong(tenDigitNumber, 0L)
        val isTtlBlacklisted = blacklistExpiry > System.currentTimeMillis()
        val isBlacklisted = isTtlBlacklisted || normalizedNumber.endsWith("9999")

        if (isBlacklisted) {
            return "reject"
        }

        if (isRepeatCaller) {
            Log.d("KinGuard", "Allowed (Offline): Repeat caller within 5m")
            return "allow"
        }

        if (normalizedNumber.endsWith("7777")) {
            return "drop_after_answer"
        }

        if (normalizedNumber.endsWith("8888")) {
            // Reject suspicious calls cleanly so Telecom drops them immediately
            // and prevents the phone or voicemail from picking them up automatically when screen is off
            return "reject"
        }

        return "allow"
    }

    private fun sendNotification(number: String) {
        val manager = getSystemService(NotificationManager::class.java)
        val channelId = "blocked_calls"
        val channel = NotificationChannel(channelId, "KinGuard Blocked Calls", NotificationManager.IMPORTANCE_DEFAULT)
        manager.createNotificationChannel(channel)

        val notification = Notification.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("KinGuard: Call Blocked")
            .setContentText("Spam call from $number blocked")
            .setAutoCancel(true)
            .build()
        manager.notify(number.hashCode(), notification)
    }

    private fun applyCallAction(callDetails: Call.Details, action: String) {
        val builder = CallResponse.Builder()

        when (action) {
            "reject" -> {
                builder.setDisallowCall(true)
                builder.setRejectCall(true)
                builder.setSkipCallLog(true)
                builder.setSkipNotification(true)
            }
            "silence" -> {
                builder.setSilenceCall(true)
            }
            "allow" -> {
                // Default builder allows the call
            }
        }

        respondToCall(callDetails, builder.build())
    }
}
