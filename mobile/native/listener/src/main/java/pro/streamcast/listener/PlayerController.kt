package pro.streamcast.listener

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.media3.common.C
import androidx.media3.common.MediaItem as ExoMediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import pro.streamcast.core.Api
import pro.streamcast.core.Playable

/**
 * One ExoPlayer for the whole app. Whatever is playing keeps playing while the
 * listener moves between screens; the bar at the bottom shows what it is.
 */
object PlayerController {
    var exo: ExoPlayer? = null
        private set

    var current: Playable? by mutableStateOf(null)
        private set
    var playing: Boolean by mutableStateOf(false)
        private set
    var elapsedMs: Long by mutableStateOf(0)
        private set

    /** Seconds, or 0 when the length is not known (a live stream). */
    var totalSeconds: Long by mutableStateOf(0)
        private set

    /** True while a phone broadcast is being followed at its live edge. */
    var following: Boolean by mutableStateOf(false)
        private set

    private val followScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var followJob: Job? = null

    private fun engine(context: Context): ExoPlayer {
        exo?.let { return it }
        val created = ExoPlayer.Builder(context.applicationContext).build()
        created.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                playing = isPlaying
            }
        })
        exo = created
        return created
    }

    fun play(context: Context, item: Playable) {
        if (item.url.isBlank()) return
        val engine = engine(context)
        followJob?.cancel()
        followJob = null
        following = item.liveSessionId != null
        current = item
        elapsedMs = 0
        totalSeconds = 0

        val sessionId = item.liveSessionId
        if (sessionId != null) {
            // A phone broadcast is one file the phone is still appending to, so there is
            // nothing to open yet — the follower below starts it as soon as a slice lands.
            engine.stop()
            engine.clearMediaItems()
            follow(context.applicationContext, item, sessionId)
            return
        }

        engine.setMediaItem(ExoMediaItem.fromUri(item.url))
        engine.prepare()
        engine.playWhenReady = true
    }

    fun toggle(context: Context) {
        val engine = exo ?: return
        if (engine.isPlaying) engine.pause() else engine.play()
    }

    fun seekTo(seconds: Long) {
        exo?.seekTo(seconds * 1000)
        elapsedMs = seconds * 1000
    }

    fun stop() {
        followJob?.cancel()
        followJob = null
        following = false
        exo?.stop()
        exo?.clearMediaItems()
        current = null
        playing = false
        elapsedMs = 0
        totalSeconds = 0
    }

    /**
     * Follow a broadcast that is still being written. The phone appends slices to one WebM
     * file, and this poll re-opens it at the position the listener had reached whenever it has
     * grown — so playback stays a couple of seconds behind the live edge, the same way the web
     * player does. When the session ends the final part is opened once more so the tail is
     * heard, and what played stays available on the station as a Relive item.
     */
    private fun follow(context: Context, item: Playable, sessionId: Int) {
        followJob = followScope.launch {
            var opened = false
            var offset = 0L
            while (isActive) {
                val manifest = runCatching { Api.get("/live/$sessionId/manifest") }.getOrNull()
                if (manifest == null) {
                    delay(4000)
                    continue
                }
                val bytes = manifest.optLong("bytes")
                val stillLive = manifest.optBoolean("is_live")
                val engine = exo ?: break

                if (bytes > 0 && (!opened || bytes > offset)) {
                    val from = if (opened) engine.currentPosition.coerceAtLeast(0) else 0L
                    runCatching {
                        engine.setMediaItem(ExoMediaItem.fromUri(item.url), from)
                        engine.prepare()
                        engine.playWhenReady = true
                    }
                    opened = true
                    offset = bytes
                }
                if (opened && !stillLive) break
                delay(4000)
            }
            following = false
        }
    }

    /** Polled by the player bar while something is loaded. */
    fun tick() {
        val engine = exo ?: return
        elapsedMs = engine.currentPosition.coerceAtLeast(0)
        val total = engine.duration
        totalSeconds = if (total == C.TIME_UNSET || total <= 0) 0 else total / 1000
    }
}
