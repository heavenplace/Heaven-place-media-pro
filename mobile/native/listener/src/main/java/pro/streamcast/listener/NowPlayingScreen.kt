package pro.streamcast.listener

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import pro.streamcast.core.Artwork
import pro.streamcast.core.Brand
import pro.streamcast.core.LiveBadge
import pro.streamcast.core.Message
import pro.streamcast.core.clock

/**
 * The full player: the video picture for a TV stream, the artwork for radio, and the
 * controls. Audio keeps playing behind the bar when this screen is closed.
 */
@OptIn(UnstableApi::class)
@Composable
fun NowPlayingScreen(context: Context) {
    val item = PlayerController.current
    if (item == null) {
        Message("Nothing is playing.")
        return
    }
    val total = PlayerController.totalSeconds
    val elapsed = PlayerController.elapsedMs / 1000

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)
    ) {
        if (item.video) {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        useController = false
                        player = PlayerController.exo
                    }
                },
                modifier = Modifier.fillMaxWidth().height(232.dp)
                    .clip(RoundedCornerShape(14.dp)).background(Color.Black)
            )
        } else {
            Box(Modifier.fillMaxWidth().padding(vertical = 12.dp), contentAlignment = Alignment.Center) {
                Artwork(item.artwork, "♪", size = 220.dp, radius = 18.dp)
            }
        }

        Spacer(Modifier.height(16.dp))
        Text(item.title, color = Brand.text, fontSize = 19.sp, fontWeight = FontWeight.Bold)
        Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            if (item.live) {
                LiveBadge()
                Spacer(Modifier.width(6.dp))
            }
            Text(item.subtitle, color = Brand.muted, fontSize = 13.sp)
        }

        Spacer(Modifier.height(18.dp))
        if (total > 0) {
            val fraction = (elapsed.toFloat() / total).coerceIn(0f, 1f)
            Box(
                Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(50)).background(Brand.panel2)
                    .pointerInput(total) {
                        detectTapGestures { offset ->
                            val ratio = (offset.x / size.width).coerceIn(0f, 1f)
                            PlayerController.seekTo((total * ratio).toLong())
                        }
                    }
            ) {
                Box(Modifier.fillMaxWidth(fraction).height(6.dp).background(Brand.accent))
            }
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(clock(elapsed), color = Brand.muted, fontSize = 11.5.sp)
                Text(clock(total), color = Brand.muted, fontSize = 11.5.sp)
            }
        } else {
            Text(if (item.live) "On air — live" else "Streaming", color = Brand.muted, fontSize = 12.sp)
        }

        Row(
            Modifier.fillMaxWidth().padding(top = 22.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            CircleButton(if (PlayerController.playing) "❚❚" else "▶", true, size = 64.dp) {
                PlayerController.toggle(context)
            }
            Spacer(Modifier.width(16.dp))
            CircleButton("✕", false, size = 46.dp) { PlayerController.stop() }
        }
    }
}
