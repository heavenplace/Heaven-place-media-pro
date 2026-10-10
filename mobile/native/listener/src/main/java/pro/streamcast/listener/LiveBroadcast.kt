package pro.streamcast.listener

import android.annotation.SuppressLint
import android.content.Context
import android.hardware.Camera
import android.media.MediaRecorder
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import pro.streamcast.core.Api
import pro.streamcast.core.Station
import java.io.File
import java.io.RandomAccessFile

/**
 * Going live from the phone itself: the device is the source, exactly as the web studio's
 * LiveBroadcaster is. `MediaRecorder` writes a WebM file (VP8 + Opus, or Opus alone for a
 * radio station) into the app's cache, and every couple of seconds whatever has been written
 * since the last slice is posted to `POST /api/live/:id/chunk` — the same endpoint the web
 * broadcaster uses, appending to the one growing file a listener follows through
 * `GET /api/live/:id/manifest`.
 *
 * WebM is the only container Android writes progressively: an MP4 has its index written when
 * recording stops, so nothing can play it while it is still being recorded. The mime stored on
 * the session is therefore always video/webm or audio/webm, which is also what decides the
 * file's extension on the server and the type every viewer keys off.
 *
 * Unlike the browser, recording here needs no wake lock: the recorder and this loop live in an
 * app-wide object, so the broadcast survives the studio screen being recomposed or its tab being
 * switched. It is ended when the owner stops it by hand or leaves the studio, and the API's own
 * sweep closes and archives it either way.
 */
object LiveBroadcast {
    /** MediaRecorder's WebM output arrived in Android 10. */
    val supported: Boolean get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

    var live by mutableStateOf(false)
        private set
    var busy by mutableStateOf(false)
        private set
    var chunks by mutableStateOf(0)
        private set
    var bytes by mutableStateOf(0L)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var pump: Job? = null
    private var recorder: MediaRecorder? = null
    private var camera: Camera? = null
    private var file: File? = null
    private var sessionId: Int? = null
    private var mime: String = ""
    private var sent: Long = 0

    /** Open a session, start recording, and begin sending slices. */
    fun start(context: Context, station: Station, title: String, video: Boolean, window: String) {
        if (live || busy) return
        if (!supported) {
            error = "Broadcasting from this phone needs Android 10 or newer."
            return
        }
        busy = true
        error = null
        val app = context.applicationContext
        scope.launch {
            try {
                val target = File(app.cacheDir, "live-${System.currentTimeMillis()}.webm")
                val format = if (video) "video/webm;codecs=vp8,opus" else "audio/webm;codecs=opus"
                // The recorder is built before the session, so a device that refuses the
                // camera fails before anything is put on air.
                val opened = openRecorder(app, target, video)
                recorder = opened.first
                camera = opened.second

                val body = JSONObject()
                    .put("station_id", station.id)
                    .put("title", title)
                    .put("kind", if (video) "video" else "audio")
                    .put("mime", format)
                if (window == "permanent") body.put("permanent", true) else body.put("hours", window.toIntOrNull() ?: 1)
                val id = Api.post("/live", body).optJSONObject("session")?.optInt("id") ?: 0
                if (id == 0) throw IllegalStateException("the API did not open a live session")

                file = target
                mime = format
                sessionId = id
                sent = 0
                chunks = 0
                bytes = 0
                recorder?.start()
                live = true
                pump = scope.launch { pump() }
            } catch (failure: Exception) {
                release()
                file?.delete()
                file = null
                sessionId = null
                error = "Could not start the broadcast: ${failure.message ?: "the camera or microphone refused"}"
            } finally {
                busy = false
            }
        }
    }

    /** End the broadcast by hand, and say so — what it recorded stays on the station. */
    fun stop(notify: (String) -> Unit, fail: (String) -> Unit) {
        if (!live) return
        busy = true
        scope.launch {
            try {
                end()
                notify("You are off air — the broadcast is saved on the station as a Relive item.")
            } catch (failure: Exception) {
                fail(failure.message ?: "Could not end the broadcast")
            } finally {
                busy = false
            }
        }
    }

    /** Leaving the studio ends the broadcast, the way closing the web page does. */
    fun endOnExit() {
        if (!live) return
        scope.launch { end() }
    }

    /**
     * Stop recording, send the last slice the recorder wrote, and close the session. The end
     * request is what archives the broadcast as a Relive item; if it never arrives, the API's
     * sweep closes the session once the slices stop.
     */
    private suspend fun end() {
        pump?.cancel()
        pump = null
        val id = sessionId
        runCatching { recorder?.stop() }
        release()
        if (id != null) flush(id)
        live = false
        sessionId = null
        if (id != null) runCatching { Api.post("/live/$id/end") }
        file?.delete()
        file = null
        chunks = 0
        bytes = 0
    }

    /** The slice loop: everything written since last time, in order, one retry each. */
    private suspend fun pump() {
        while (currentCoroutineContext().isActive) {
            delay(2000)
            val id = sessionId ?: return
            val slice = readNew() ?: continue
            if (slice.isEmpty()) continue
            var done = false
            repeat(2) { attempt ->
                if (done) return@repeat
                try {
                    val info = Api.postBytes("/live/$id/chunk", slice, mime)
                    chunks = info.optInt("chunk_count")
                    bytes = info.optLong("bytes")
                    done = true
                } catch (failure: Exception) {
                    // A slice lost to a momentary drop leaves a hole in everyone's stream, so
                    // each one rides out a single failure before the next slice carries on.
                    if (attempt == 1) error = "Broadcast interrupted: ${failure.message}. Check your connection."
                }
            }
        }
    }

    private suspend fun flush(id: Int) {
        val slice = readNew() ?: return
        if (slice.isEmpty()) return
        runCatching {
            val info = Api.postBytes("/live/$id/chunk", slice, mime)
            chunks = info.optInt("chunk_count")
            bytes = info.optLong("bytes")
        }
    }

    /** Whatever the recorder has appended since the last slice. */
    private fun readNew(): ByteArray? {
        val target = file ?: return null
        val length = target.length()
        if (length <= sent) return null
        // A slice never has to be large: the recorder is flushed every couple of seconds, and
        // capping it keeps one long stall from turning into one huge request.
        val size = minOf(length - sent, 8L * 1024 * 1024).toInt()
        return RandomAccessFile(target, "r").use { reader ->
            reader.seek(sent)
            val slice = ByteArray(size)
            reader.readFully(slice)
            sent += size
            slice
        }
    }

    // The legacy Camera and its MediaRecorder hooks are deprecated but are the only ones that
    // record without a preview surface, which is what a headless broadcast wants.
    @SuppressLint("MissingPermission")
    @Suppress("DEPRECATION")
    private fun openRecorder(context: Context, target: File, video: Boolean): Pair<MediaRecorder, Camera?> {
        val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(context) else MediaRecorder()
        var opened: Camera? = null
        try {
            if (video) {
                val device = Camera.open() ?: throw IllegalStateException("this phone has no camera")
                device.unlock()
                opened = device
                recorder.setCamera(device)
            }
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            if (video) recorder.setVideoSource(MediaRecorder.VideoSource.CAMERA)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.WEBM)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.OPUS)
            recorder.setAudioEncodingBitRate(96_000)
            if (video) {
                recorder.setVideoEncoder(MediaRecorder.VideoEncoder.VP8)
                // 480p is the size every camera in this range can hand a recorder; a
                // broadcast is bounded by the phone's connection long before its sensor.
                recorder.setVideoSize(640, 480)
                recorder.setVideoFrameRate(30)
                recorder.setVideoEncodingBitRate(1_500_000)
            }
            recorder.setOutputFile(target.absolutePath)
            recorder.prepare()
            return recorder to opened
        } catch (failure: Exception) {
            runCatching { recorder.release() }
            runCatching { opened?.release() }
            throw failure
        }
    }

    @Suppress("DEPRECATION")
    private fun release() {
        runCatching { recorder?.release() }
        recorder = null
        runCatching { camera?.release() }
        camera = null
    }
}
