package pro.streamcast.listener

import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import pro.streamcast.core.Account
import pro.streamcast.core.Api
import pro.streamcast.core.Artwork
import pro.streamcast.core.Banner
import pro.streamcast.core.Brand
import pro.streamcast.core.LiveBadge
import pro.streamcast.core.Message
import pro.streamcast.core.Notice
import pro.streamcast.core.Pill
import pro.streamcast.core.PrimaryButton
import pro.streamcast.core.RowCard
import pro.streamcast.core.RowText
import pro.streamcast.core.SectionTitle
import pro.streamcast.core.liveOf
import pro.streamcast.core.mediaOf
import pro.streamcast.core.objects
import pro.streamcast.core.remote
import pro.streamcast.core.stationOf
import pro.streamcast.core.toPlayable

/** One station: what is on air, what has been published, and a way to play it. */
@Composable
fun StationScreen(stationId: Int, account: Account, go: (Screen) -> Unit, context: Context) {
    val state = remote("station-$stationId") {
        val body = Api.get("/stations/$stationId")
        Triple(
            stationOf(body.getJSONObject("station")),
            body.objects("media").map { mediaOf(it) },
            body.optJSONObject("live")?.let { liveOf(it) }
        )
    }
    var blocked by remember { mutableStateOf<String?>(null) }

    val loaded = state.data
    if (loaded == null) {
        Message(if (state.loading) "Loading station…" else state.error ?: "Station not found")
        return
    }
    val (station, media, live) = loaded
    val liveNow = live?.toPlayable()

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 16.dp)) {
        item { Banner(station.artwork, if (station.isTv) "🎬" else "📻") }
        item {
            Column(Modifier.padding(14.dp)) {
                Text(station.name, color = Brand.text, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Pill(if (station.isTv) "TV" else "Radio")
                    if (station.verified) {
                        Spacer(Modifier.width(6.dp))
                        Pill("Verified", Brand.ok)
                    }
                    if (liveNow != null) {
                        Spacer(Modifier.width(6.dp))
                        LiveBadge()
                    }
                }
                if (station.description.isNotBlank()) {
                    Text(
                        station.description,
                        color = Brand.muted,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
                blocked?.let { Notice(it) }
                if (liveNow != null) {
                    Spacer(Modifier.height(12.dp))
                    PrimaryButton(if (liveNow.video) "Watch live" else "Listen live") {
                        PlayerController.play(context, liveNow)
                        if (liveNow.video) go(Screen.NowPlaying)
                    }
                }
            }
        }

        if (media.isEmpty()) {
            item { Message("Nothing published on this station yet.") }
        } else {
            item { Column(Modifier.padding(horizontal = 14.dp)) { SectionTitle("Published") } }
            items(media, key = { "media-${it.id}" }) { item ->
                Column(Modifier.padding(horizontal = 14.dp)) {
                    RowCard(onClick = {
                        if (item.isPremium && !account.isPremium) {
                            blocked = "Premium content — subscribe from the StreamCast website to play this."
                        } else {
                            PlayerController.play(
                                context,
                                item.toPlayable(station.name).copy(artwork = item.artwork ?: station.artwork)
                            )
                            if (item.isVideo) go(Screen.NowPlaying)
                        }
                    }) {
                        Artwork(item.artwork ?: station.artwork, if (item.isVideo) "🎬" else "♪")
                        RowText(item.title, MediaRowText(item))
                        Spacer(Modifier.weight(1f))
                        if (item.isPremium) Pill("Premium", Brand.accent) else Text("▶", color = Brand.accent, fontSize = 15.sp)
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }
}
