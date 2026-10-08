package pro.streamcast.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class ApiException(message: String, val status: Int = 0) : Exception(message)

/**
 * The one place that talks to the StreamCast API. A native client calls the API origin
 * directly — there is no web proxy in between — so the origin is baked in at build time.
 */
object Api {
    var baseUrl: String = ""
    var token: String? = null

    private val jsonType = "application/json; charset=utf-8".toMediaType()

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    /** Media and artwork come back as `/uploads/...`, which the API also serves. */
    fun absolute(path: String?): String? {
        if (path.isNullOrBlank()) return null
        if (path.startsWith("http://") || path.startsWith("https://")) return path
        return baseUrl.trimEnd('/') + "/" + path.trimStart('/')
    }

    suspend fun get(path: String): JSONObject = call("GET", path, null) ?: JSONObject()

    suspend fun post(path: String, body: JSONObject? = null): JSONObject = call("POST", path, body) ?: JSONObject()

    suspend fun patch(path: String, body: JSONObject? = null): JSONObject = call("PATCH", path, body) ?: JSONObject()

    suspend fun delete(path: String) {
        call("DELETE", path, null)
    }

    /** The app boots against the API origin, so sign-in and browse work without the site. */
    suspend fun ping(): Boolean = runCatching { get("/config") }.isSuccess

    private suspend fun call(method: String, path: String, body: JSONObject?): JSONObject? =
        withContext(Dispatchers.IO) {
            val builder = Request.Builder().url(baseUrl.trimEnd('/') + "/api" + path)
            token?.let { builder.header("Authorization", "Bearer $it") }
            when (method) {
                "GET" -> builder.get()
                "DELETE" -> builder.delete()
                else -> builder.method(method, (body?.toString() ?: "").toRequestBody(jsonType))
            }
            client.newCall(builder.build()).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) throw ApiException(errorMessage(text, response.code), response.code)
                if (text.isBlank()) null else JSONObject(text)
            }
        }

    private fun errorMessage(text: String, code: Int): String {
        if (text.isNotBlank()) {
            runCatching { JSONObject(text).optString("error") }.getOrNull()
                ?.takeIf { it.isNotBlank() }
                ?.let { return it }
        }
        return "Request failed ($code)"
    }
}

/** Reads `{"stations": [ ... ]}` and friends into a plain list. */
fun JSONObject.objects(key: String): List<JSONObject> {
    val array: JSONArray = optJSONArray(key) ?: return emptyList()
    return (0 until array.length()).mapNotNull { array.optJSONObject(it) }
}
