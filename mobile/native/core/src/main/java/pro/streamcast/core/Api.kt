package pro.streamcast.core

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import okio.source
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

    suspend fun put(path: String, body: JSONObject? = null): JSONObject = call("PUT", path, body) ?: JSONObject()

    suspend fun delete(path: String) {
        call("DELETE", path, null)
    }

    /**
     * Posts a file the phone picked to `/api/uploads` — the same endpoint the web studio
     * uses. The bytes stream straight from the content uri, so a long recording never has
     * to fit in memory. Returns `{ url, mime, size, name }`.
     */
    suspend fun upload(fileName: String, mime: String, resolver: ContentResolver, uri: Uri): JSONObject =
        withContext(Dispatchers.IO) {
            val part = MultipartBody.Builder().setType(MultipartBody.FORM)
                .addFormDataPart("file", fileName, StreamBody(resolver, uri, mime.toMediaTypeOrNull()))
                .build()
            val builder = Request.Builder().url(baseUrl.trimEnd('/') + "/api/uploads").post(part)
            token?.let { builder.header("Authorization", "Bearer $it") }
            uploads.newCall(builder.build()).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) throw ApiException(errorMessage(text, response.code), response.code)
                if (text.isBlank()) JSONObject() else JSONObject(text)
            }
        }

    /**
     * Posts raw bytes with the given content type — one slice of a phone broadcast, to
     * `POST /api/live/:id/chunk`, which appends it to the session's recording. The API takes
     * the mime from the session, so the type here is what the request declares rather than
     * what decides the file.
     */
    suspend fun postBytes(path: String, bytes: ByteArray, contentType: String): JSONObject =
        withContext(Dispatchers.IO) {
            val builder = Request.Builder().url(baseUrl.trimEnd('/') + "/api" + path)
                .post(bytes.toRequestBody(contentType.toMediaTypeOrNull()))
            token?.let { builder.header("Authorization", "Bearer $it") }
            client.newCall(builder.build()).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) throw ApiException(errorMessage(text, response.code), response.code)
                if (text.isBlank()) JSONObject() else JSONObject(text)
            }
        }

    private val uploads: OkHttpClient = client.newBuilder()
        .writeTimeout(10, TimeUnit.MINUTES)
        .readTimeout(5, TimeUnit.MINUTES)
        .build()

    /** A picked file, read from the content resolver when OkHttp asks for it. */
    private class StreamBody(
        private val resolver: ContentResolver,
        private val uri: Uri,
        private val type: MediaType?
    ) : RequestBody() {
        override fun contentType(): MediaType? = type

        override fun contentLength(): Long =
            resolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getLong(0).takeIf { it > 0 } ?: -1L else -1L
            } ?: -1L

        override fun writeTo(sink: BufferedSink) {
            val input = resolver.openInputStream(uri) ?: throw ApiException("That file could not be opened")
            input.use { sink.writeAll(it.source()) }
        }
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
