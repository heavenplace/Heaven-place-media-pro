package pro.streamcast.listener

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import pro.streamcast.core.Account
import pro.streamcast.core.Api
import pro.streamcast.core.Artwork
import pro.streamcast.core.Brand
import pro.streamcast.core.LiveBadge
import pro.streamcast.core.LiveSession
import pro.streamcast.core.MediaItem
import pro.streamcast.core.Message
import pro.streamcast.core.Pill
import pro.streamcast.core.Podcast
import pro.streamcast.core.PrimaryButton
import pro.streamcast.core.RowCard
import pro.streamcast.core.RowText
import pro.streamcast.core.SectionTitle
import pro.streamcast.core.Station
import pro.streamcast.core.clock
import pro.streamcast.core.episodeOf
import pro.streamcast.core.liveOf
import pro.streamcast.core.objects
import pro.streamcast.core.podcastOf
import pro.streamcast.core.remote
import pro.streamcast.core.stationOf
import pro.streamcast.core.toPlayable

@Composable
fun HomeScreen(go: (Screen) -> Unit, context: Context) {
    val live = remote("home-live") { Api.get("/live").objects("live").map { liveOf(it) } }
    val stations = remote("home-stations") { Api.get("/stations").objects("stations").map { stationOf(it) } }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
        item {
            Column(Modifier.padding(bottom = 2.dp)) {
                Text(
                    "Radio, TV and podcasts — live and on demand.",
                    color = Brand.text,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    "Everything the control room publishes appears here.",
                    color = Brand.muted,
                    fontSize = 12.5.sp,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }

        item { SectionTitle("On air now") }
        val onAir = live.data.orEmpty()
        if (onAir.isEmpty()) {
            item { Message(if (live.loading) "Checking what is on air…" else "Nothing is on air right now.") }
        } else {
            items(onAir, key = { "live-${it.id}" }) { session ->
                LiveRow(session, context)
                Spacer(Modifier.height(8.dp))
            }
        }

        item { SectionTitle("Stations") }
        val list = stations.data.orEmpty()
        if (list.isEmpty()) {
            item { Message(if (stations.loading) "Loading stations…" else stations.error ?: "No stations yet.") }
        } else {
            items(list, key = { "station-${it.id}" }) { station ->
                StationRow(station) { go(Screen.Station(station.id)) }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

@Composable
fun BrowseScreen(kind: String, go: (Screen) -> Unit, context: Context) {
    val tv = kind == "tv"
    val live = remote("browse-live-$kind") {
        Api.get("/live").objects("live").map { liveOf(it) }.filter { it.video == tv }
    }
    val stations = remote("browse-$kind") {
        Api.get("/stations?kind=$kind").objects("stations").map { stationOf(it) }
    }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
        item {
            Text(
                if (tv) "TV stations" else "Radio stations",
                color = Brand.text,
                fontSize = 19.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 4.dp)
            )
        }

        val onAir = live.data.orEmpty()
        if (onAir.isNotEmpty()) {
            item { SectionTitle("On air now") }
            items(onAir, key = { "live-${it.id}" }) { session ->
                LiveRow(session, context)
                Spacer(Modifier.height(8.dp))
            }
        }

        item { SectionTitle("All ${if (tv) "TV" else "radio"}") }
        val list = stations.data.orEmpty()
        if (list.isEmpty()) {
            item { Message(if (stations.loading) "Loading stations…" else stations.error ?: "No stations yet.") }
        } else {
            items(list, key = { "station-${it.id}" }) { station ->
                StationRow(station) { go(Screen.Station(station.id)) }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

@Composable
fun LiveRow(session: LiveSession, context: Context) {
    RowCard(onClick = { session.toPlayable()?.let { PlayerController.play(context, it) } }) {
        Artwork(session.stationArtwork, if (session.video) "🎬" else "♪")
        RowText(session.title, "${session.stationName} · on air")
        Spacer(Modifier.weight(1f))
        LiveBadge()
    }
}

@Composable
fun StationRow(station: Station, onClick: () -> Unit) {
    RowCard(onClick = onClick) {
        Artwork(station.artwork, if (station.isTv) "🎬" else "📻")
        RowText(station.name, "${station.owner ?: "StreamCast"} · ${station.mediaCount} items")
        Spacer(Modifier.weight(1f))
        when {
            station.live -> LiveBadge()
            station.verified -> Pill("Verified", Brand.ok)
            else -> Pill(if (station.isTv) "TV" else "Radio")
        }
    }
}

@Composable
fun PodcastsScreen(context: Context) {
    var open by remember { mutableStateOf<Podcast?>(null) }
    val shows = remote("podcasts") { Api.get("/podcasts").objects("podcasts").map { podcastOf(it) } }

    val show = open
    if (show != null) {
        val episodes = remote("podcast-${show.id}") {
            Api.get("/podcasts/${show.id}").objects("episodes").map { episodeOf(it) }
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
            item {
                Text(
                    "←  All shows",
                    color = Brand.accent,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(Brand.panel2)
                        .clickable { open = null }.padding(horizontal = 12.dp, vertical = 7.dp)
                )
                Spacer(Modifier.height(14.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Artwork(show.artwork, "🎙", size = 62.dp)
                    RowText(show.title, show.owner ?: "Podcast")
                }
                Spacer(Modifier.height(10.dp))
            }
            val list = episodes.data.orEmpty()
            if (list.isEmpty()) {
                item { Message(if (episodes.loading) "Loading episodes…" else episodes.error ?: "No episodes yet.") }
            } else {
                items(list, key = { "episode-${it.id}" }) { episode ->
                    RowCard(onClick = { PlayerController.play(context, episode.toPlayable(show.title, show.artwork)) }) {
                        Artwork(show.artwork, "🎙")
                        RowText(
                            episode.title,
                            listOfNotNull(
                                if (episode.durationSeconds > 0) clock(episode.durationSeconds.toLong()) else null,
                                "Episode"
                            ).joinToString(" · ")
                        )
                        Spacer(Modifier.weight(1f))
                        Text("▶", color = Brand.accent, fontSize = 15.sp)
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
        return
    }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
        item { SectionTitle("Podcasts") }
        val list = shows.data.orEmpty()
        if (list.isEmpty()) {
            item { Message(if (shows.loading) "Loading shows…" else shows.error ?: "No shows yet.") }
        } else {
            items(list, key = { "show-${it.id}" }) { podcast ->
                RowCard(onClick = { open = podcast }) {
                    Artwork(podcast.artwork, "🎙")
                    RowText(podcast.title, podcast.owner ?: "StreamCast")
                    Spacer(Modifier.weight(1f))
                    Pill("${podcast.episodeCount} ep")
                }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

@Composable
fun AccountScreen(account: Account, onSignOut: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        SectionTitle("Signed in")
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Brand.panel).padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Artwork(null, account.name.take(1).uppercase(), size = 46.dp)
            RowText(account.name, account.email)
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Pill("Role: ${account.role}")
            Pill("Plan: ${account.tier}", if (account.isPremium) Brand.ok else Brand.muted)
        }
        Spacer(Modifier.height(22.dp))
        PrimaryButton("Sign out") { onSignOut() }
    }
}

/** Kept here so the premium line in the station screen can reuse it. */
@Composable
fun MediaRowText(item: MediaItem): String = listOfNotNull(
    if (item.isVideo) "Video" else "Audio",
    if (item.durationSeconds > 0) clock(item.durationSeconds.toLong()) else null,
    if (item.isPremium) "Premium · ${item.priceCents / 100}${if (item.priceCents % 100 == 0) "" else "." + (item.priceCents % 100)}" else null
).joinToString(" · ")
