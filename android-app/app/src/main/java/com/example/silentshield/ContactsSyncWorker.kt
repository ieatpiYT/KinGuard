package com.example.silentshield

import android.content.Context
import android.provider.ContactsContract
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class ContactsSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val whitelist = mutableSetOf<String>()
        try {
            val cursor = applicationContext.contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
                null, null, null
            )

            cursor?.use {
                val index = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                while (it.moveToNext()) {
                    val number = it.getString(index)?.replace(Regex("[^0-9+]"), "") ?: continue
                    if (number.isNotEmpty()) {
                        whitelist.add(number)
                    }
                }
            }

            applicationContext.getSharedPreferences("shield_prefs", Context.MODE_PRIVATE)
                .edit()
                .putStringSet("whitelist", whitelist)
                .apply()

            // Push to Vite dev-bridge (port 5173) and Python backend (port 5001)
            if (whitelist.isNotEmpty()) {
                val json = JSONObject().apply {
                    put("contacts", JSONArray(whitelist.toList()))
                    put("add_whitelist", JSONArray(whitelist.toList()))
                }.toString()
                val mediaType = "application/json; charset=utf-8".toMediaType()
                val client = OkHttpClient.Builder()
                    .connectTimeout(2, TimeUnit.SECONDS)
                    .build()

                for (url in listOf("http://10.0.2.2:5173/api/sync-contacts", "http://10.0.2.2:5001/sync")) {
                    try {
                        val req = Request.Builder()
                            .url(url)
                            .post(json.toRequestBody(mediaType))
                            .build()
                        client.newCall(req).execute().close()
                    } catch (_: Exception) {
                    }
                }
            }

            return Result.success()
        } catch (e: Exception) {
            return Result.retry()
        }
    }
}
