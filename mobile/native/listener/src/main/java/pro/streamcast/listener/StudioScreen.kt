package pro.streamcast.listener

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject
import pro.streamcast.core.Api
import pro.streamcast.core.ApiException
import pro.streamcast.core.Brand
import pro.streamcast.core.Chip
import pro.streamcast.core.Episode
import pro.streamcast.core.Line
import pro.streamcast.core.LiveBadge
import pro.streamcast.core.LiveSession
import pro.streamcast.core.MediaItem
import pro.streamcast.core.Message
import pro.streamcast.core.Notice
import pro.streamcast.core.Pill
import pro.streamcast.core.Podcast
import pro.streamcast.core.PrimaryButton
import pro.streamcast.core.SectionTitle
import pro.streamcast.core.Station
import pro.streamcast.core.TextInput
import pro.streamcast.core.clock
import pro.streamcast.core.episodeOf
import pro.streamcast.core.liveOf
import pro.streamcast.core.mediaOf
import pro.streamcast.core.objects
import pro.streamcast.core.podcastOf
import pro.streamcast.core.remote
import pro.streamcast.core.stampLabel
import pro.streamcast.core.stationOf

private val STUDIO_TABS = listOf(
    "overview" to "Overview",
    "media" to "Media",
    "live" to "Live windows",
    "podcasts" to "Podcasts",
    "settings" to "Station settings"
)

internal val WINDOWS = listOf(
    "1" to "1 hour",
    "4" to "4 hours",
    "12" to "12 hours",
    "24" to "24 hours",
    "permanent" to "24/7 — never ends"
)

/**
 * The creator studio, on the phone: the same five tabs and the same owner-scoped API as the
 * web dashboard at /studio. Publishing uploads a file the phone picked; recording a phone
 * broadcast from the camera stays a web-only feature.
 */
@Composable
fun StudioScreen(onOpenLicence: () -> Unit = {}) {
    var tab by remember { mutableStateOf("overview") }
    var picked by remember { mutableStateOf<Int?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    val stations = remote("studio-stations") { Api.get("/stations/mine").objects("stations").map { stationOf(it) } }
    val media = remote("studio-media") { Api.get("/media/mine").objects("media").map { mediaOf(it) } }
    val live = remote("studio-live") { Api.get("/live/mine").objects("live").map { liveOf(it) } }
    val shows = remote("studio-podcasts") { Api.get("/podcasts/mine").objects("podcasts").map { podcastOf(it) } }

    val owned = stations.data.orEmpty()
    val station = owned.find { it.id == picked } ?: owned.firstOrNull()
    val mine = media.data.orEmpty()
    val stationMedia = mine.filter { it.stationId == station?.id }
    val stationLive = live.data.orEmpty().filter { it.stationId == station?.id }

    val reload: () -> Unit = { stations.reload(); media.reload(); live.reload(); shows.reload() }
    val notify: (String) -> Unit = { notice = it; error = null }
    val fail: (String) -> Unit = { error = it; notice = null }

    // A broadcast started here ends when the owner leaves the studio — the same way closing
    // the web studio's page does — and the API archives it as a Relive item either way.
    DisposableEffect(Unit) { onDispose { LiveBroadcast.endOnExit() } }

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxWidth().background(Brand.bg).padding(horizontal = 14.dp)) {
            if (owned.size > 1) {
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    owned.forEach { item -> Chip(item.name, item.id == station?.id) { picked = item.id } }
                }
                Spacer(Modifier.height(6.dp))
            }
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                STUDIO_TABS.forEach { (id, label) -> Chip(label, tab == id) { tab = id } }
            }
            Spacer(Modifier.height(4.dp))
            notice?.let { Notice(it, Brand.ok) }
            error?.let { Notice(it, Brand.live) }
            Line()
        }

        Box(Modifier.weight(1f)) {
            if (station == null) {
                if (tab == "podcasts") {
                    PodcastsTab(shows.data.orEmpty(), notify, fail, reload)
                } else {
                    Column(Modifier.fillMaxSize().padding(14.dp)) {
                        Message(
                            stations.error
                                ?: "You do not own a station yet. Apply for a licence in the Licence tab — pay the " +
                                "fee with PrcPay and the control room opens your station. The Podcasts tab works " +
                                "without one."
                        )
                        PrimaryButton("Apply for a station licence") { onOpenLicence() }
                    }
                }
            } else {
                when (tab) {
                    "media" -> MediaTab(station, stationMedia, notify, fail, reload)
                    "live" -> LiveTab(station, stationMedia, stationLive, notify, fail, reload)
                    "podcasts" -> PodcastsTab(shows.data.orEmpty(), notify, fail, reload)
                    "settings" -> SettingsTab(station, notify, fail, reload)
                    else -> OverviewTab(station, stationMedia, stationLive) { tab = it }
                }
            }
        }
    }
}

/** What the studio's overview shows: the station's shape, and whether it is on air. */
@Composable
private fun OverviewTab(
    station: Station,
    media: List<MediaItem>,
    live: List<LiveSession>,
    openTab: (String) -> Unit
) {
    val onAir = live.firstOrNull { it.onAir }
    val total = media.sumOf { it.durationSeconds }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
        item { SectionTitle(station.name) }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Stat("Published", media.size.toString())
                Stat("Premium / paid", media.count { it.access != "free" }.toString())
                Stat("Total runtime", clock(total.toLong()))
                Stat("Hidden", media.count { !it.visible }.toString())
            }
        }

        item {
            Column(
                Modifier.fillMaxWidth().padding(top = 14.dp).clip(RoundedCornerShape(12.dp))
                    .background(Brand.panel).padding(12.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "On air",
                        color = Brand.text,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f)
                    )
                    if (onAir != null) LiveBadge() else Pill("Off air")
                }
                if (onAir == null) {
                    Text(
                        "Nothing is on air right now.",
                        color = Brand.muted,
                        fontSize = 11.5.sp,
                        modifier = Modifier.padding(top = 6.dp)
                    )
                } else {
                    Text(
                        onAir.title,
                        color = Brand.text,
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(top = 6.dp)
                    )
                    Text(
                        if (onAir.permanent || onAir.expiresAt == null) "24/7 — never ends" else onAir.airLabel,
                        color = Brand.muted,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
                Row(Modifier.padding(top = 10.dp)) {
                    Chip(if (onAir == null) "Go live" else "Manage live window", active = onAir == null) {
                        openTab("live")
                    }
                }
            }
        }

        item { SectionTitle("Recent live windows") }
        val recent = live.take(4)
        if (recent.isEmpty()) {
            item { Message("${station.name} has no live windows yet.") }
        } else {
            items(recent, key = { "overview-live-${it.id}" }) { session ->
                Row(
                    Modifier.fillMaxWidth().padding(bottom = 8.dp).clip(RoundedCornerShape(12.dp))
                        .background(Brand.panel).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(session.title, color = Brand.text, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                        Text(
                            listOfNotNull(
                                stampLabel(session.startedAt),
                                if (session.onAir) "live" else session.status,
                                if (session.recordingUrl != null) "relive available" else null
                            ).joinToString(" · "),
                            color = Brand.muted,
                            fontSize = 11.sp,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                    if (session.onAir) LiveBadge() else Pill(session.status)
                }
            }
        }
    }
}

/** Publish an item to the station: upload a file from this phone, or point at a link. */
@Composable
private fun MediaTab(
    station: Station,
    media: List<MediaItem>,
    notify: (String) -> Unit,
    fail: (String) -> Unit,
    reload: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val video = station.isTv

    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var link by remember { mutableStateOf("") }
    var url by remember { mutableStateOf("") }
    var seconds by remember { mutableStateOf(0) }
    var access by remember { mutableStateOf("free") }
    var price by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf<Int?>(null) }

    fun patch(item: MediaItem, body: JSONObject, message: String) {
        scope.launch {
            try {
                Api.patch("/media/${item.id}", body)
                notify(message)
                reload()
            } catch (failure: Exception) {
                fail(failure.message ?: "That change did not go through")
            }
        }
    }

    fun remove(item: MediaItem) {
        scope.launch {
            try {
                Api.delete("/media/${item.id}")
                confirmDelete = null
                notify("Item deleted.")
                reload()
            } catch (failure: Exception) {
                fail(failure.message ?: "Could not delete that item")
            }
        }
    }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
        item { SectionTitle("Publish to ${station.name}") }
        item {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Brand.panel).padding(12.dp)
            ) {
                Text("Publish an item", color = Brand.text, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Text(
                    "Upload a file from this phone, or point at one already online.",
                    color = Brand.muted,
                    fontSize = 11.5.sp,
                    modifier = Modifier.padding(top = 4.dp)
                )

                TextInput(title, { title = it }, "Title")
                TextInput(description, { description = it }, "Description", singleLine = false)

                UploadField(
                    accept = if (video) "video/*" else "audio/*",
                    label = if (video) "Upload a video" else "Upload an audio file",
                    uploaded = url,
                    onUploaded = { stored, length ->
                        url = stored
                        seconds = length
                        link = ""
                    },
                    onError = fail
                )

                TextInput(
                    link,
                    { value ->
                        link = value
                        if (value.isNotBlank()) {
                            url = value.trim()
                            seconds = 0
                        }
                    },
                    "…or paste a link"
                )

                Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("free" to "Free", "premium" to "Premium", "paid" to "Paid download").forEach { (value, label) ->
                        Chip(label, access == value) { access = value }
                    }
                }
                if (access == "paid") {
                    TextInput(price, { price = it }, "Price in cents (min 50)", keyboard = KeyboardType.Number)
                }

                PrimaryButton(
                    text = if (busy) "Publishing…" else "Publish",
                    enabled = !busy && title.isNotBlank() && url.isNotBlank()
                ) {
                    busy = true
                    scope.launch {
                        try {
                            Api.post(
                                "/media",
                                JSONObject()
                                    .put("station_id", station.id)
                                    .put("type", if (video) "video" else "audio")
                                    .put("title", title.trim())
                                    .put("description", description)
                                    .put("url", url)
                                    .put("access", access)
                                    .put("price_cents", if (access == "paid") price.toIntOrNull() ?: 0 else 0)
                                    .put("duration_seconds", seconds)
                                    .put("source", "upload")
                            )
                            title = ""
                            description = ""
                            link = ""
                            url = ""
                            seconds = 0
                            price = ""
                            notify("Published — it is in the listener app now.")
                            reload()
                        } catch (failure: Exception) {
                            fail(failure.message ?: "Could not publish that item")
                        } finally {
                            busy = false
                        }
                    }
                }
            }
        }

        item { SectionTitle("Published on ${station.name}") }
        if (media.isEmpty()) {
            item { Message("Nothing published on ${station.name} yet.") }
        } else {
            items(media, key = { "studio-media-${it.id}" }) { item ->
                Column(
                    Modifier.fillMaxWidth().padding(bottom = 8.dp).clip(RoundedCornerShape(12.dp))
                        .background(Brand.panel).padding(10.dp)
                ) {
                    Text(
                        item.title,
                        color = Brand.text,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        listOfNotNull(
                            if (item.isVideo) "Video" else "Audio",
                            if (item.durationSeconds > 0) clock(item.durationSeconds.toLong()) else null,
                            when (item.access) {
                                "premium" -> "Premium"
                                "paid" -> "Paid download"
                                else -> "Free"
                            },
                            if (item.visible) null else "hidden"
                        ).joinToString(" · "),
                        color = Brand.muted,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                    Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Chip(if (item.visible) "Hide" else "Show") {
                            patch(item, JSONObject().put("visible", !item.visible), if (item.visible) "Hidden from listeners." else "Visible again.")
                        }
                        if (confirmDelete == item.id) {
                            Chip("Confirm delete", active = true) { remove(item) }
                        } else {
                            Chip("Delete") { confirmDelete = item.id }
                        }
                        if (item.flagged) Pill("Flagged", Brand.live)
                    }
                }
            }
        }
    }
}

/** Open a live window on something already published, or run one 24/7. */
@Composable
private fun LiveTab(
    station: Station,
    media: List<MediaItem>,
    live: List<LiveSession>,
    notify: (String) -> Unit,
    fail: (String) -> Unit,
    reload: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var mediaId by remember { mutableStateOf<Int?>(null) }
    var title by remember { mutableStateOf("") }
    var window by remember { mutableStateOf("1") }
    var busy by remember { mutableStateOf(false) }

    val onAir = live.filter { it.onAir }
    val past = live.filter { !it.onAir }

    fun end(session: LiveSession) {
        scope.launch {
            try {
                Api.post("/live/${session.id}/end")
                notify(if (session.isPhoneBroadcast) "Off air — the broadcast is saved as a Relive item." else "Live window ended.")
                reload()
            } catch (failure: Exception) {
                fail(failure.message ?: "Could not end that window")
            }
        }
    }

    fun extend(session: LiveSession) {
        scope.launch {
            try {
                Api.post("/live/${session.id}/extend", JSONObject().put("hours", 1))
                notify("Added one hour to the live window.")
                reload()
            } catch (failure: Exception) {
                fail(failure.message ?: "Could not extend that window")
            }
        }
    }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
        item { SectionTitle("Go live from this phone") }
        item { PhoneGoLive(station, notify, fail, reload) }

        item { SectionTitle("Go live on ${station.name}") }
        item {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Brand.panel).padding(12.dp)
            ) {
                Text("Put something you published on air", color = Brand.text, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Text(
                    "Pick one of your published items and air it on ${station.name} for a set window — or 24/7.",
                    color = Brand.muted,
                    fontSize = 11.5.sp,
                    modifier = Modifier.padding(top = 4.dp)
                )

                if (media.isEmpty()) {
                    Text(
                        "Publish an item on the Media tab first.",
                        color = Brand.muted,
                        fontSize = 11.5.sp,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                } else {
                    Row(
                        Modifier.fillMaxWidth().padding(top = 8.dp).horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        media.forEach { item ->
                            Chip(item.title.take(22), mediaId == item.id) {
                                mediaId = item.id
                                if (title.isBlank()) title = item.title
                            }
                        }
                    }
                }

                TextInput(title, { title = it }, "Live title")
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    WINDOWS.forEach { (value, label) -> Chip(label, window == value) { window = value } }
                }
                Spacer(Modifier.height(6.dp))

                PrimaryButton(
                    text = when {
                        busy -> "Going live…"
                        window == "permanent" -> "Go live 24/7"
                        else -> "Go live"
                    },
                    enabled = !busy && (mediaId != null || title.isNotBlank())
                ) {
                    busy = true
                    scope.launch {
                        try {
                            val body = JSONObject()
                                .put("station_id", station.id)
                                .put("title", title.trim())
                                .put("kind", if (station.isTv) "video" else "audio")
                            mediaId?.let { body.put("media_id", it) }
                            if (window == "permanent") body.put("permanent", true) else body.put("hours", window.toInt())
                            Api.post("/live", body)
                            mediaId = null
                            title = ""
                            notify(
                                if (window == "permanent") "On air 24/7 — every listener sees it immediately."
                                else "On air — every listener sees it immediately."
                            )
                            reload()
                        } catch (failure: Exception) {
                            fail(failure.message ?: "Could not go live")
                        } finally {
                            busy = false
                        }
                    }
                }
            }
        }

        item { SectionTitle("On air now") }
        if (onAir.isEmpty()) {
            item { Message("${station.name} is off air. Start a live window above to go live.") }
        } else {
            items(onAir, key = { "studio-live-${it.id}" }) { session ->
                LiveWindowCard(session, onExtend = { extend(session) }, onEnd = { end(session) })
            }
        }

        item { SectionTitle("Past windows") }
        if (past.isEmpty()) {
            item { Message("No past windows yet.") }
        } else {
            items(past.take(8), key = { "studio-past-${it.id}" }) { session ->
                Row(
                    Modifier.fillMaxWidth().padding(bottom = 8.dp).clip(RoundedCornerShape(12.dp))
                        .background(Brand.panel).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(session.title, color = Brand.text, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                        Text(
                            listOfNotNull(
                                stampLabel(session.startedAt),
                                session.status,
                                if (session.recordingUrl != null) "Relive available on the station page" else null
                            ).joinToString(" · "),
                            color = Brand.muted,
                            fontSize = 11.sp,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                    }
                    Pill(session.status)
                }
            }
        }
    }
}

@Composable
private fun LiveWindowCard(session: LiveSession, onExtend: () -> Unit, onEnd: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(bottom = 8.dp).clip(RoundedCornerShape(12.dp))
            .background(Brand.panel).padding(12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                session.title,
                color = Brand.text,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            Spacer(Modifier.width(8.dp))
            LiveBadge()
        }
        Text(
            listOfNotNull(
                stampLabel(session.startedAt)?.let { "Started $it" },
                if (session.permanent || session.expiresAt == null) "24/7 — never ends" else session.airLabel,
                if (session.isPhoneBroadcast) "phone broadcast" else null
            ).joinToString(" · "),
            color = Brand.muted,
            fontSize = 11.sp,
            modifier = Modifier.padding(top = 4.dp)
        )
        Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (!(session.permanent || session.expiresAt == null)) {
                Chip("Extend +1 hour") { onExtend() }
            }
            Chip("End now") { onEnd() }
        }
    }
}

/** The podcasts a creator owns, and publishing episodes to them. */
@Composable
private fun PodcastsTab(
    shows: List<Podcast>,
    notify: (String) -> Unit,
    fail: (String) -> Unit,
    reload: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var showId by remember { mutableStateOf<Int?>(null) }
    val show = shows.find { it.id == showId } ?: shows.firstOrNull()

    val episodes = remote("studio-episodes-${show?.id ?: 0}") {
        show?.let { Api.get("/podcasts/${it.id}").objects("episodes").map { row -> episodeOf(row) } } ?: emptyList()
    }

    var newTitle by remember { mutableStateOf("") }
    var newDescription by remember { mutableStateOf("") }
    var episodeTitle by remember { mutableStateOf("") }
    var episodeNotes by remember { mutableStateOf("") }
    var episodeUrl by remember { mutableStateOf("") }
    var episodeLink by remember { mutableStateOf("") }
    var episodeSeconds by remember { mutableStateOf(0) }
    var busy by remember { mutableStateOf(false) }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
        item { SectionTitle("Start a show") }
        item {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Brand.panel).padding(12.dp)
            ) {
                Text("A podcast is yours to fill.", color = Brand.muted, fontSize = 11.5.sp)
                TextInput(newTitle, { newTitle = it }, "Show title")
                TextInput(newDescription, { newDescription = it }, "Description", singleLine = false)
                PrimaryButton("Create show", enabled = !busy && newTitle.isNotBlank()) {
                    busy = true
                    scope.launch {
                        try {
                            val created = Api.post(
                                "/podcasts",
                                JSONObject().put("title", newTitle.trim()).put("description", newDescription)
                            )
                            newTitle = ""
                            newDescription = ""
                            showId = created.optJSONObject("podcast")?.optInt("id")
                            notify("Show created — publish your first episode.")
                            reload()
                        } catch (failure: Exception) {
                            fail(failure.message ?: "Could not create that show")
                        } finally {
                            busy = false
                        }
                    }
                }
            }
        }

        if (shows.isEmpty()) {
            item { Message("You have no shows yet. Create one above and its episodes appear on the podcasts page.") }
        } else {
            item {
                Row(
                    Modifier.fillMaxWidth().padding(top = 14.dp).horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    shows.forEach { item ->
                        Chip(
                            if (item.episodeCount > 0) "${item.title} · ${item.episodeCount}" else item.title,
                            item.id == show?.id
                        ) { showId = item.id }
                    }
                }
            }

            if (show != null) {
                item { SectionTitle("Publish an episode to ${show.title}") }
                item {
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Brand.panel).padding(12.dp)
                    ) {
                        TextInput(episodeTitle, { episodeTitle = it }, "Episode title")
                        TextInput(episodeNotes, { episodeNotes = it }, "Show notes", singleLine = false)
                        UploadField(
                            accept = "audio/*",
                            label = "Upload the episode",
                            uploaded = episodeUrl,
                            onUploaded = { stored, length ->
                                episodeUrl = stored
                                episodeSeconds = length
                                episodeLink = ""
                            },
                            onError = fail
                        )
                        TextInput(
                            episodeLink,
                            { value ->
                                episodeLink = value
                                if (value.isNotBlank()) {
                                    episodeUrl = value.trim()
                                    episodeSeconds = 0
                                }
                            },
                            "…or paste a link"
                        )
                        PrimaryButton(
                            text = if (busy) "Publishing…" else "Publish episode",
                            enabled = !busy && episodeTitle.isNotBlank() && episodeUrl.isNotBlank()
                        ) {
                            busy = true
                            scope.launch {
                                try {
                                    Api.post(
                                        "/podcasts/${show.id}/episodes",
                                        JSONObject()
                                            .put("title", episodeTitle.trim())
                                            .put("description", episodeNotes)
                                            .put("url", episodeUrl)
                                            .put("duration_seconds", episodeSeconds)
                                    )
                                    episodeTitle = ""
                                    episodeNotes = ""
                                    episodeUrl = ""
                                    episodeLink = ""
                                    episodeSeconds = 0
                                    notify("Episode published — it is on the podcasts page now.")
                                    reload()
                                    episodes.reload()
                                } catch (failure: Exception) {
                                    fail(failure.message ?: "Could not publish that episode")
                                } finally {
                                    busy = false
                                }
                            }
                        }
                    }
                }
            }

            item { SectionTitle("Episodes") }
            val list: List<Episode> = episodes.data.orEmpty()
            if (list.isEmpty()) {
                item { Message(if (episodes.loading) "Loading episodes…" else "No episodes on ${show?.title} yet.") }
            } else {
                items(list, key = { "studio-episode-${it.id}" }) { episode ->
                    Row(
                        Modifier.fillMaxWidth().padding(bottom = 8.dp).clip(RoundedCornerShape(12.dp))
                            .background(Brand.panel).padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(episode.title, color = Brand.text, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                            if (episode.durationSeconds > 0) {
                                Text(clock(episode.durationSeconds.toLong()), color = Brand.muted, fontSize = 11.sp)
                            }
                        }
                        Chip("Delete") {
                            scope.launch {
                                try {
                                    Api.delete("/podcasts/episodes/${episode.id}")
                                    notify("Episode removed.")
                                    reload()
                                    episodes.reload()
                                } catch (failure: Exception) {
                                    fail(failure.message ?: "Could not remove that episode")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Rename the station, describe it, and change its artwork. */
@Composable
private fun SettingsTab(
    station: Station,
    notify: (String) -> Unit,
    fail: (String) -> Unit,
    reload: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var name by remember(station.id) { mutableStateOf(station.name) }
    var description by remember(station.id) { mutableStateOf(station.description) }
    var artwork by remember(station.id) { mutableStateOf(station.artwork ?: "") }
    var busy by remember { mutableStateOf(false) }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
        item { SectionTitle("Station settings") }
        item {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Brand.panel).padding(12.dp)
            ) {
                TextInput(name, { name = it }, "Station name")
                TextInput(description, { description = it }, "Description", singleLine = false)
                UploadField(
                    accept = "image/*",
                    label = "Upload station artwork",
                    uploaded = artwork.takeIf { it.isNotBlank() },
                    onUploaded = { stored, _ -> artwork = stored },
                    onError = fail
                )
                Spacer(Modifier.height(6.dp))
                PrimaryButton("Save changes", enabled = !busy && name.isNotBlank()) {
                    busy = true
                    scope.launch {
                        try {
                            Api.patch(
                                "/stations/${station.id}",
                                JSONObject()
                                    .put("name", name.trim())
                                    .put("description", description)
                                    .put("artwork_url", artwork)
                            )
                            notify("Station saved.")
                            reload()
                        } catch (failure: Exception) {
                            fail(failure.message ?: "Could not save the station")
                        } finally {
                            busy = false
                        }
                    }
                }
            }
        }

        item { SectionTitle("Payout details") }
        item { PayoutSettings(notify, fail) }
    }
}

private data class PayoutForm(
    val accountName: String = "",
    val bankName: String = "",
    val accountNumber: String = "",
    val routingNumber: String = "",
    val note: String = ""
)

/**
 * Where the control room sends this account's settled earnings — the same payout profile the
 * web studio saves (`/api/earnings/account`), so an owner can set it from the phone too. One
 * profile covers every station the account owns, and the control room reads it when it
 * records a payout. The money itself moves outside the app, so this is only the instruction.
 */
@Composable
private fun PayoutSettings(notify: (String) -> Unit, fail: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    val stored = remote("studio-payout") { Api.get("/earnings/account").optJSONObject("account") }
    var form by remember { mutableStateOf<PayoutForm?>(null) }
    var saved by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(stored.loading, stored.data) {
        if (!stored.loading && form == null) {
            val row = stored.data
            form = PayoutForm(
                accountName = row?.field("account_name").orEmpty(),
                bankName = row?.field("bank_name").orEmpty(),
                accountNumber = row?.field("account_number").orEmpty(),
                routingNumber = row?.field("routing_number").orEmpty(),
                note = row?.field("note").orEmpty()
            )
            saved = row != null
        }
    }

    val current = form ?: return

    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Brand.panel).padding(12.dp)
    ) {
        Text("Payout details", color = Brand.text, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        Text(
            "Where the control room sends the earnings from every station on this account. Use the " +
                "name on the account, not the station name.",
            color = Brand.muted,
            fontSize = 11.5.sp,
            modifier = Modifier.padding(top = 4.dp)
        )

        TextInput(current.accountName, { form = form?.copy(accountName = it) }, "Account holder")
        TextInput(current.bankName, { form = form?.copy(bankName = it) }, "Bank")
        TextInput(current.accountNumber, { form = form?.copy(accountNumber = it) }, "Account number")
        TextInput(current.routingNumber, { form = form?.copy(routingNumber = it) }, "Routing / sort code / SWIFT")
        TextInput(current.note, { form = form?.copy(note = it) }, "Note for the control room")

        Text(
            if (saved) "Saved — the control room sees these details." else "Not saved yet.",
            color = Brand.muted,
            fontSize = 11.sp,
            modifier = Modifier.padding(top = 4.dp)
        )
        Spacer(Modifier.height(6.dp))

        PrimaryButton(
            text = if (busy) "Saving…" else "Save payout details",
            enabled = !busy &&
                current.accountName.isNotBlank() &&
                current.bankName.isNotBlank() &&
                current.accountNumber.isNotBlank()
        ) {
            busy = true
            scope.launch {
                try {
                    Api.put(
                        "/earnings/account",
                        JSONObject()
                            .put("account_name", current.accountName.trim())
                            .put("bank_name", current.bankName.trim())
                            .put("account_number", current.accountNumber.trim())
                            .put("routing_number", current.routingNumber)
                            .put("note", current.note)
                    )
                    saved = true
                    notify("Payout details saved.")
                } catch (failure: Exception) {
                    fail(failure.message ?: "Could not save the payout details")
                } finally {
                    busy = false
                }
            }
        }
    }
}

/** A nullable text column — the API sends a real JSON null for "no value". */
private fun JSONObject.field(key: String): String? = if (isNull(key)) null else optString(key)

/** Pick a file from the phone, upload it to the API, and hand back its url and length. */
@Composable
private fun UploadField(
    accept: String,
    label: String,
    uploaded: String?,
    onUploaded: (String, Int) -> Unit,
    onError: (String) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var pickedName by remember { mutableStateOf<String?>(null) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            try {
                val file = describe(context, uri)
                pickedName = file.name
                val response = Api.upload(file.name, file.mime, context.contentResolver, uri)
                val url = response.optString("url").takeIf { it.isNotBlank() }
                    ?: throw ApiException("The upload did not return a file")
                onUploaded(url, file.seconds)
            } catch (failure: Exception) {
                pickedName = null
                onError(failure.message ?: "That upload failed")
            } finally {
                busy = false
            }
        }
    }

    Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Chip(if (busy) "Uploading…" else "Choose a file") { if (!busy) picker.launch(accept) }
        Spacer(Modifier.width(8.dp))
        Text(
            pickedName ?: if (uploaded != null) "File ready" else label,
            color = Brand.muted,
            fontSize = 11.5.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun RowScope.Stat(label: String, value: String) {
    Column(
        Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(Brand.panel).padding(10.dp)
    ) {
        Text(value, color = Brand.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        Text(label, color = Brand.muted, fontSize = 10.sp, maxLines = 2)
    }
}

private class PickedFile(val name: String, val mime: String, val seconds: Int)

/** The name, type and length of a file the user picked, read before it is uploaded. */
private fun describe(context: Context, uri: Uri): PickedFile {
    val resolver = context.contentResolver
    val mime = resolver.getType(uri) ?: "application/octet-stream"
    var name = "upload"
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
            cursor.getString(0)?.takeIf { it.isNotBlank() }?.let { name = it }
        }
    }
    val seconds = if (mime.startsWith("audio") || mime.startsWith("video")) lengthOf(context, uri) else 0
    return PickedFile(name, mime, seconds)
}

/** How long a recording runs, so the published item keeps its duration. */
private fun lengthOf(context: Context, uri: Uri): Int = runCatching {
    val retriever = MediaMetadataRetriever()
    try {
        retriever.setDataSource(context, uri)
        ((retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L) / 1000).toInt()
    } finally {
        retriever.release()
    }
}.getOrDefault(0)
