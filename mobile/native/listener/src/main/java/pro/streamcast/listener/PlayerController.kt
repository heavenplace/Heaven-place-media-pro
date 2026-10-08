package pro.streamcast.listener

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.media3.common.C
import androidx.media3.common.MediaItem as ExoMediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
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
        current = item
        elapsedMs = 0
        totalSeconds = 0
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
        exo?.stop()
        exo?.clearMediaItems()
        current = null
        playing = false
        elapsedMs = 0
        totalSeconds = 0
    }

    /** Polled by the player bar while something is loaded. */
    fun tick() {
        val engine = exo ?: return
        elapsedMs = engine.currentPosition.coerceAtLeast(0)
        val total = engine.duration
        totalSeconds = if (total == C.TIME_UNSET || total <= 0) 0 else total / 1000
    }
}
