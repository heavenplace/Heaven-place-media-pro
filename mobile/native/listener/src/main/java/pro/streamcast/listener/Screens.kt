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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import pro.streamcast.core.AccentBadge
import pro.streamcast.core.Account
import pro.streamcast.core.Api
import pro.streamcast.core.Artwork
import pro.streamcast.core.Brand
import pro.streamcast.core.Chip
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
import pro.streamcast.core.mediaOf
import pro.streamcast.core.objects
import pro.streamcast.core.podcastOf
import pro.streamcast.core.remote
import pro.streamcast.core.stationOf
import pro.streamcast.core.toPlayable

/** The listener home: the same sections, in the same order, as the web home page. */
@Composable
fun HomeScreen(go: (Screen) -> Unit, context: Context) {
    val live = remote("home-live") { Api.get("/live").objects("live").map { liveOf(it) } }
    val stations = remote("home-stations") { Api.get("/stations").objects("stations").map { stationOf(it) } }
    val media = remote("home-media") { Api.get("/media").objects("media").map { mediaOf(it) } }

    val onAir = live.data.orEmpty()
    val listed = stations.data.orEmpty()
    val radio = listed.filter { !it.isTv }.take(4)
    val tv = listed.filter { it.isTv }.take(4)
    val latest = media.data.orEmpty()

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
        item { Hero(go) }

        item { SectionHeader("On air now") }
        if (onAir.isEmpty()) {
            item {
                Message(
                    if (live.loading) "Checking what is on air…"
                    else "Nothing is on air right now — check a station for its on-demand shows."
                )
            }
        } else {
            items(onAir, key = { "live-${it.id}" }) { session ->
                LiveCard(session, context, go)
                Spacer(Modifier.height(8.dp))
            }
        }

        item { SectionHeader("Radio stations", "See all") { go(Screen.Browse("radio")) } }
        if (radio.isEmpty()) {
            item {
                val problem = stations.error
                Message(if (stations.loading) "Loading stations…" else problem ?: "No radio stations yet.")
            }
        } else {
            items(radio, key = { "radio-${it.id}" }) { station ->
                StationRow(station) { go(Screen.Station(station.id)) }
                Spacer(Modifier.height(8.dp))
            }
        }

        item { SectionHeader("TV stations", "See all") { go(Screen.Browse("tv")) } }
        if (tv.isEmpty()) {
            item { Message(if (stations.loading) "Loading stations…" else "No TV stations yet.") }
        } else {
            items(tv, key = { "tv-${it.id}" }) { station ->
                StationRow(station) { go(Screen.Station(station.id)) }
                Spacer(Modifier.height(8.dp))
            }
        }

        item { SectionHeader("Latest uploads") }
        if (latest.isEmpty()) {
            item { Message(if (media.loading) "Loading uploads…" else "Nothing has been published yet.") }
        } else {
            items(latest.take(6), key = { "media-${it.id}" }) { item ->
                RowCard(onClick = { PlayerController.play(context, item.toPlayable()) }) {
                    Artwork(item.artwork, if (item.isVideo) "🎬" else "♪")
                    RowText(item.title, item.stationName ?: MediaRowText(item))
                    Spacer(Modifier.weight(1f))
                    Text("▶", color = Brand.accent, fontSize = 15.sp)
                }
                Spacer(Modifier.height(8.dp))
            }
            item {
                Text(
                    "Streaming is free — downloads unlock by tier.",
                    color = Brand.muted,
                    fontSize = 11.sp,
                    modifier = Modifier.padding(top = 10.dp)
                )
            }
        }
    }
}

/** The web hero: the strapline, the promise and the two ways in. */
@Composable
private fun Hero(go: (Screen) -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Brand.panel).padding(16.dp)
    ) {
        AccentBadge("Streaming free for everyone")
        Text(
            "Radio, TV and podcasts — live and on demand.",
            color = Brand.text,
            fontSize = 19.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 12.dp)
        )
        Text(
            "Listen or watch from any device, download what your tier allows, and go live from your own phone. " +
                "Everything published in the control room appears here instantly.",
            color = Brand.muted,
            fontSize = 12.5.sp,
            modifier = Modifier.padding(top = 8.dp)
        )
        Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            HeroButton("Browse radio", true) { go(Screen.Browse("radio")) }
            HeroButton("Browse TV", false) { go(Screen.Browse("tv")) }
        }
    }
}

@Composable
private fun HeroButton(text: String, primary: Boolean, onClick: () -> Unit) {
    Text(
        text,
        color = if (primary) Color.White else Brand.text,
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.clip(RoundedCornerShape(50))
            .background(if (primary) Brand.accent else Brand.panel2)
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 9.dp)
    )
}

/** A section heading, with the "See all" chip the web page puts beside it. */
@Composable
private fun SectionHeader(title: String, link: String? = null, onClick: () -> Unit = {}) {
    Row(
        Modifier.fillMaxWidth().padding(top = 18.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(title, color = Brand.text, fontSize = 15.5.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        if (link != null) Chip(link, onClick = onClick)
    }
}

/** One on-air card: the station, the title, how long it runs, and how to watch or listen. */
@Composable
private fun LiveCard(session: LiveSession, context: Context, go: (Screen) -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Brand.panel).padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                session.stationName,
                color = Brand.text,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f)
            )
            LiveBadge()
        }
        Text(session.title, color = Brand.muted, fontSize = 12.5.sp, modifier = Modifier.padding(top = 6.dp))
        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Pill(if (session.video) "Video" else "Audio")
            Spacer(Modifier.width(6.dp))
            Text(session.airLabel, color = Brand.muted, fontSize = 11.sp)
        }
        Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (session.isPhoneBroadcast) {
                HeroButton("Watch live", true) { go(Screen.Station(session.stationId)) }
            } else {
                HeroButton("Tune in", true) { session.toPlayable()?.let { PlayerController.play(context, it) } }
                HeroButton("Station", false) { go(Screen.Station(session.stationId)) }
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
