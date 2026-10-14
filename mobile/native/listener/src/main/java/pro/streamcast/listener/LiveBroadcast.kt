package pro.streamcast.listener

import android.annotation.SuppressLint
import android.content.Context
import android.hardware.Camera
import android.media.MediaRecorder
import android.os.Build
import android.view.SurfaceHolder
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
import pro.streamcast.core.QualityPreset
import pro.streamcast.core.Station
import pro.streamcast.core.qualityPreset
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
 * The stage comes first, the broadcast after it: `startCamera` opens the chosen lens and paints
 * it on the studio's surface, so the owner sees what is about to go out and can turn it round
 * to the other camera, and only then does "Go live" hand that same camera to the recorder —
 * the web studio's own order. A stage the owner never started is opened at the moment the
 * broadcast begins.
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

    /** A camera is open and painting on the stage — before going live, or while it is on air. */
    var previewing by mutableStateOf(false)
        private set

    /** The camera the owner picked: "environment" is the back one, "user" the front. */
    var facing by mutableStateOf("environment")
        private set

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var pump: Job? = null
    private var recorder: MediaRecorder? = null
    private var camera: Camera? = null
    private var file: File? = null
    private var sessionId: Int? = null
    private var mime: String = ""
    private var sent: Long = 0
    private var preview: SurfaceHolder? = null

    /**
     * Open a session, start recording, and begin sending slices. `quality` is the key the
     * station remembers — the same list the web studio offers — and decides whether there is
     * a picture at all and how large it is.
     */
    fun start(context: Context, station: Station, title: String, window: String, quality: String) {
        if (live || busy) return
        if (!supported) {
            error = "Broadcasting from this phone needs Android 10 or newer."
            return
        }
        val preset = qualityPreset(quality)
        val video = !preset.audioOnly
        busy = true
        error = null
        val app = context.applicationContext
        scope.launch {
            try {
                val target = File(app.cacheDir, "live-${System.currentTimeMillis()}.webm")
                val format = if (video) "video/webm;codecs=vp8,opus" else "audio/webm;codecs=opus"
                // A radio preset has no picture, so a stage the owner had started is let go
                // before the microphone-only recorder is built.
                if (!video) stopCamera()
                // The recorder is built before the session, so a device that refuses the
                // camera fails before anything is put on air. A camera already open on the
                // stage is the one it records with, so going live does not open the lens twice.
                val opened = openRecorder(app, target, preset, if (video) camera else null)
                recorder = opened.first
                camera = opened.second
                previewing = video && camera != null
                showPreview()

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

    /**
     * Open the camera on the studio's stage without recording — the step before "Go live", so
     * the owner sees the picture that is about to go out. Best-effort: a device that refuses a
     * preview still records when the broadcast starts.
     */
    fun startCamera() {
        if (live || busy || previewing) return
        if (!supported) {
            error = "Broadcasting from this phone needs Android 10 or newer."
            return
        }
        busy = true
        error = null
        scope.launch {
            try {
                openCamera(facing)
            } catch (failure: Exception) {
                previewing = false
                error = "Could not reach the camera: ${failure.message ?: "it refused"}"
            } finally {
                busy = false
            }
        }
    }

    /** Turn the stage round to the other camera — the front/back switch the web studio offers. */
    fun switchCamera() {
        if (live || busy) return
        facing = if (facing == "environment") "user" else "environment"
        busy = true
        scope.launch {
            try {
                openCamera(facing)
            } catch (failure: Exception) {
                previewing = false
                error = "Could not reach the camera: ${failure.message ?: "it refused"}"
            } finally {
                busy = false
            }
        }
    }

    /**
     * Let the stage's camera go: leaving the studio releases it, and so does picking the
     * audio-only preset. A broadcast that is still running keeps the camera it records with.
     */
    fun releaseCamera() {
        if (live) return
        scope.launch { stopCamera() }
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

    /** The camera device for the chosen side, or whichever one this phone has. */
    @Suppress("DEPRECATION")
    private fun cameraIdFor(side: String): Int {
        val info = Camera.CameraInfo()
        for (id in 0 until Camera.getNumberOfCameras()) {
            Camera.getCameraInfo(id, info)
            if (side == "user" && info.facing == Camera.CameraInfo.CAMERA_FACING_FRONT) return id
            if (side == "environment" && info.facing == Camera.CameraInfo.CAMERA_FACING_BACK) return id
        }
        return 0
    }

    /** Open the chosen camera and paint it on the studio's stage. */
    @SuppressLint("MissingPermission")
    @Suppress("DEPRECATION")
    private fun openCamera(side: String) {
        stopCamera()
        val device = Camera.open(cameraIdFor(side)) ?: throw IllegalStateException("this phone has no camera")
        camera = device
        previewing = true
        showPreview()
    }

    @Suppress("DEPRECATION")
    private fun stopCamera() {
        stopPreview()
        runCatching { camera?.release() }
        camera = null
        previewing = false
    }

    // The legacy Camera and its MediaRecorder hooks are deprecated but are the only ones whose
    // recording works the same with or without a preview surface, which is what a broadcast from
    // a screen the owner may close wants.
    @SuppressLint("MissingPermission")
    @Suppress("DEPRECATION")
    private fun openRecorder(
        context: Context,
        target: File,
        preset: QualityPreset,
        existing: Camera? = null
    ): Pair<MediaRecorder, Camera?> {
        val video = !preset.audioOnly
        val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(context) else MediaRecorder()
        var opened: Camera? = null
        try {
            if (video) {
                val device = existing ?: Camera.open(cameraIdFor(facing))
                    ?: throw IllegalStateException("this phone has no camera")
                // The recorder takes the camera while it records; the stage's preview is put back
                // on the same device once the recorder is prepared, exactly as the web
                // broadcaster keeps painting the canvas it streams.
                if (existing != null) stopPreview()
                device.unlock()
                opened = device
                recorder.setCamera(device)
            }
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            if (video) recorder.setVideoSource(MediaRecorder.VideoSource.CAMERA)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.WEBM)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.OPUS)
            recorder.setAudioEncodingBitRate(preset.audioBits)
            if (video) {
                recorder.setVideoEncoder(MediaRecorder.VideoEncoder.VP8)
                recorder.setVideoSize(preset.width, preset.height)
                recorder.setVideoFrameRate(preset.frameRate)
                recorder.setVideoEncodingBitRate(preset.videoBits)
            }
            recorder.setOutputFile(target.absolutePath)
            try {
                recorder.prepare()
            } catch (refused: Exception) {
                if (!video) throw refused
                // A camera that will not hand the recorder the size the preset asks for — a 4K
                // or 60fps sensor, say — falls back to 480p rather than refusing to go live,
                // the way the web studio's "ideal" constraints do.
                recorder.setVideoSize(640, 480)
                recorder.setVideoFrameRate(30)
                recorder.setVideoEncodingBitRate(1_500_000)
                recorder.prepare()
            }
            return recorder to opened
        } catch (failure: Exception) {
            runCatching { recorder.release() }
            runCatching { opened?.release() }
            throw failure
        }
    }

    /** The studio's stage — the picture the viewers are getting, as it is sent. */
    fun attachPreview(holder: SurfaceHolder) {
        preview = holder
        showPreview()
    }

    fun detachPreview() {
        preview = null
        stopPreview()
    }

    // Best-effort throughout: a device that refuses a preview still records.
    @Suppress("DEPRECATION")
    private fun showPreview() {
        val device = camera ?: return
        val holder = preview ?: return
        runCatching {
            device.setPreviewDisplay(holder)
            device.startPreview()
        }
    }

    @Suppress("DEPRECATION")
    private fun stopPreview() {
        val device = camera ?: return
        runCatching { device.stopPreview() }
        runCatching { device.setPreviewDisplay(null) }
    }

    @Suppress("DEPRECATION")
    private fun release() {
        runCatching { recorder?.release() }
        recorder = null
        stopCamera()
    }
}
