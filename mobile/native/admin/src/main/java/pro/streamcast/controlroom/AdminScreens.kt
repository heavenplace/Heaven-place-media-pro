package pro.streamcast.controlroom

import androidx.compose.foundation.background
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject
import pro.streamcast.core.Account
import pro.streamcast.core.Api
import pro.streamcast.core.Artwork
import pro.streamcast.core.Brand
import pro.streamcast.core.LiveBadge
import pro.streamcast.core.LiveSession
import pro.streamcast.core.Message
import pro.streamcast.core.Notice
import pro.streamcast.core.Pill
import pro.streamcast.core.RowCard
import pro.streamcast.core.RowText
import pro.streamcast.core.SectionTitle
import pro.streamcast.core.Station
import pro.streamcast.core.activityOf
import pro.streamcast.core.adminUserOf
import pro.streamcast.core.liveOf
import pro.streamcast.core.objects
import pro.streamcast.core.overviewOf
import pro.streamcast.core.remote
import pro.streamcast.core.stationOf

/** The five desks of the control room, kept in one file so the app has one place to look. */

@Composable
fun DashboardScreen(account: Account) {
    val overview = remote("overview") { overviewOf(Api.get("/admin/overview").getJSONObject("overview")) }
    val activity = remote("activity") { Api.get("/admin/activity?limit=40").objects("activity").map { activityOf(it) } }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
        item {
            Text("Hello, ${account.name}", color = Brand.text, fontSize = 19.sp, fontWeight = FontWeight.Bold)
            Text(
                "What the platform is doing right now.",
                color = Brand.muted,
                fontSize = 12.5.sp,
                modifier = Modifier.padding(top = 4.dp)
            )
            Spacer(Modifier.height(12.dp))
        }

        val counters = overview.data
        if (counters == null) {
            item { Message(if (overview.loading) "Loading counters…" else overview.error ?: "No data") }
        } else {
            item {
                StatRow(listOf("Live now" to counters.liveNow, "Listeners" to counters.activeListeners, "Stations" to counters.stations))
                StatRow(listOf("Users" to counters.users, "Media" to counters.media, "Podcasts" to counters.podcasts))
                StatRow(
                    listOf(
                        "Pending stations" to counters.pendingStations,
                        "Open requests" to counters.pendingRequests,
                        "Unlocks" to counters.unlocks
                    )
                )
            }
        }

        item { SectionTitle("Recent activity") }
        val rows = activity.data.orEmpty()
        if (rows.isEmpty()) {
            item { Message(if (activity.loading) "Loading activity…" else activity.error ?: "Nothing yet.") }
        } else {
            items(rows, key = { "activity-${it.id}" }) { row ->
                RowCard(onClick = {}) {
                    RowText(
                        row.detail,
                        listOfNotNull(row.userName, row.type, row.stationName).joinToString(" · ")
                    )
                    Spacer(Modifier.weight(1f))
                    Text(shortTime(row.createdAt), color = Brand.muted, fontSize = 10.sp)
                }
                Spacer(Modifier.height(6.dp))
            }
        }
    }
}

@Composable
private fun StatRow(items: List<Pair<String, Int>>) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items.forEach { (label, value) ->
            Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(Brand.panel).padding(10.dp)) {
                Text("$value", color = Brand.text, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                Text(label, color = Brand.muted, fontSize = 10.5.sp, maxLines = 2)
            }
        }
    }
}

@Composable
fun StationsScreen() {
    val stations = remote("admin-stations") { Api.get("/admin/stations").objects("stations").map { stationOf(it) } }
    val scope = rememberCoroutineScope()
    var message by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf<Int?>(null) }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
        item { SectionTitle("Stations") }
        message?.let { item { Notice(it) } }

        val list = stations.data.orEmpty()
        if (list.isEmpty()) {
            item { Message(if (stations.loading) "Loading stations…" else stations.error ?: "No stations yet.") }
        } else {
            items(list, key = { "station-${it.id}" }) { station ->
                Column {
                    RowCard(onClick = {}) {
                        Artwork(station.artwork, if (station.isTv) "🎬" else "📻")
                        RowText(
                            station.name,
                            "${station.owner ?: "no owner"} · ${station.mediaCount} items · ${if (station.isTv) "TV" else "radio"}"
                        )
                        Spacer(Modifier.weight(1f))
                        Pill(station.status, statusColor(station.status))
                    }
                    Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (station.status != "approved") {
                            ActionChip("Approve") {
                                scope.launch {
                                    try {
                                        Api.patch("/admin/stations/${station.id}", JSONObject().put("status", "approved"))
                                        message = "${station.name} is approved"
                                        stations.reload()
                                    } catch (failure: Exception) {
                                        message = failure.message
                                    }
                                }
                            }
                        }
                        if (station.status != "suspended") {
                            ActionChip("Suspend") {
                                scope.launch {
                                    try {
                                        Api.patch("/admin/stations/${station.id}", JSONObject().put("status", "suspended"))
                                        message = "${station.name} is suspended"
                                        stations.reload()
                                    } catch (failure: Exception) {
                                        message = failure.message
                                    }
                                }
                            }
                        }
                        if (confirmDelete == station.id) {
                            ActionChip("Confirm delete", danger = true) {
                                scope.launch {
                                    try {
                                        Api.delete("/admin/stations/${station.id}")
                                        message = "${station.name} was removed"
                                        confirmDelete = null
                                        stations.reload()
                                    } catch (failure: Exception) {
                                        message = failure.message
                                    }
                                }
                            }
                        } else {
                            ActionChip("Delete", danger = true) { confirmDelete = station.id }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                }
            }
        }
    }
}

private data class ModerationItem(
    val id: Int,
    val title: String,
    val station: String,
    val owner: String,
    val flagged: Boolean,
    val visible: Boolean,
    val reason: String,
    val type: String
)

private fun moderationOf(row: JSONObject) = ModerationItem(
    id = row.optInt("id"),
    title = row.optString("title"),
    station = row.optString("station_name"),
    owner = row.optString("owner_email").ifBlank { row.optString("owner_name") },
    flagged = row.optBoolean("flagged"),
    visible = row.optBoolean("visible", true),
    reason = row.optString("flag_reason"),
    type = row.optString("type", "audio")
)

private data class ModerationDesk(val flagged: Int, val hidden: Int, val total: Int, val items: List<ModerationItem>)

@Composable
fun ModerationScreen() {
    var filter by remember { mutableStateOf("all") }
    val desk = remote("moderation-$filter") {
        val path = if (filter == "all") "/admin/moderation" else "/admin/moderation?status=$filter"
        val body = Api.get(path)
        val summary = body.optJSONObject("summary") ?: JSONObject()
        ModerationDesk(
            flagged = summary.optInt("flagged"),
            hidden = summary.optInt("hidden"),
            total = summary.optInt("total"),
            items = body.objects("media").map { moderationOf(it) }
        )
    }
    val scope = rememberCoroutineScope()
    var message by remember { mutableStateOf<String?>(null) }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
        item { SectionTitle("Moderation") }
        desk.data?.let { data ->
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Pill("${data.total} items")
                    Pill("${data.flagged} flagged", Brand.accent)
                    Pill("${data.hidden} hidden", Brand.live)
                }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    ActionChip(if (filter == "all") "Everything ✓" else "Everything") { filter = "all" }
                    ActionChip(if (filter == "flagged") "Flagged ✓" else "Flagged") { filter = "flagged" }
                    ActionChip(if (filter == "hidden") "Hidden ✓" else "Hidden") { filter = "hidden" }
                }
                Spacer(Modifier.height(6.dp))
            }
        }
        message?.let { item { Notice(it) } }

        fun act(item: ModerationItem, action: String) {
            scope.launch {
                try {
                    Api.post("/admin/media/${item.id}/moderate", JSONObject().put("action", action))
                    message = "${item.title}: $action"
                    desk.reload()
                } catch (failure: Exception) {
                    message = failure.message
                }
            }
        }

        val list = desk.data?.items.orEmpty()
        if (list.isEmpty()) {
            item { Message(if (desk.loading) "Loading content…" else desk.error ?: "Nothing to review here.") }
        } else {
            items(list, key = { "media-${it.id}" }) { item ->
                Column {
                    RowCard(onClick = {}) {
                        Artwork(null, if (item.type == "video") "🎬" else "♪")
                        RowText(
                            item.title,
                            "${item.station} · ${item.owner}" + if (item.reason.isNotBlank()) " · ${item.reason}" else ""
                        )
                        Spacer(Modifier.weight(1f))
                        when {
                            !item.visible -> Pill("Hidden", Brand.live)
                            item.flagged -> Pill("Flagged", Brand.accent)
                            else -> Pill("Live", Brand.ok)
                        }
                    }
                    Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (item.flagged) ActionChip("Clear flag") { act(item, "unflag") }
                        else ActionChip("Flag") { act(item, "flag") }
                        if (item.visible) ActionChip("Hide") { act(item, "hide") }
                        else ActionChip("Restore") { act(item, "restore") }
                        ActionChip("Delete", danger = true) {
                            scope.launch {
                                try {
                                    Api.delete("/admin/media/${item.id}")
                                    message = "${item.title} was removed"
                                    desk.reload()
                                } catch (failure: Exception) {
                                    message = failure.message
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                }
            }
        }
    }
}

@Composable
fun LiveScreen() {
    val live = remote("admin-live") { Api.get("/admin/live").objects("live").map { liveOf(it) } }
    val scope = rememberCoroutineScope()
    var message by remember { mutableStateOf<String?>(null) }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
        item { SectionTitle("On air and recent sessions") }
        message?.let { item { Notice(it) } }

        val list = live.data.orEmpty()
        if (list.isEmpty()) {
            item { Message(if (live.loading) "Loading sessions…" else live.error ?: "Nothing has gone out yet.") }
        } else {
            items(list, key = { "live-${it.id}" }) { session: LiveSession ->
                Column {
                    RowCard(onClick = {}) {
                        Artwork(session.stationArtwork, if (session.video) "🎬" else "♪")
                        RowText(
                            session.title,
                            "${session.stationName} · ${if (session.recordingUrl != null) "phone broadcast" else "window"}" +
                                if (session.permanent) " · 24/7" else ""
                        )
                        Spacer(Modifier.weight(1f))
                        when {
                            session.status != "live" -> Pill(session.status)
                            session.permanent -> Pill("24/7", Brand.ok)
                            else -> LiveBadge()
                        }
                    }
                    if (session.status == "live") {
                        Row(Modifier.padding(top = 6.dp)) {
                            ActionChip("Take off air") {
                                scope.launch {
                                    try {
                                        Api.post("/admin/live/${session.id}/end")
                                        message = "${session.title} is off air and archived as Relive"
                                        live.reload()
                                    } catch (failure: Exception) {
                                        message = failure.message
                                    }
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                }
            }
        }
    }
}

@Composable
fun UsersScreen() {
    val users = remote("admin-users") { Api.get("/admin/users").objects("users").map { adminUserOf(it) } }
    val scope = rememberCoroutineScope()
    var message by remember { mutableStateOf<String?>(null) }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp)) {
        item { SectionTitle("People") }
        message?.let { item { Notice(it) } }

        fun update(id: Int, key: String, value: String, name: String) {
            scope.launch {
                try {
                    Api.patch("/admin/users/$id", JSONObject().put(key, value))
                    message = "$name is now $value"
                    users.reload()
                } catch (failure: Exception) {
                    message = failure.message
                }
            }
        }

        val list = users.data.orEmpty()
        if (list.isEmpty()) {
            item { Message(if (users.loading) "Loading people…" else users.error ?: "No accounts yet.") }
        } else {
            items(list, key = { "user-${it.id}" }) { person ->
                Column {
                    RowCard(onClick = {}) {
                        Artwork(null, person.name.take(1).uppercase(), size = 44.dp)
                        RowText(person.name, "${person.email} · ${person.unlocks} unlocks")
                        Spacer(Modifier.weight(1f))
                        Column(horizontalAlignment = Alignment.End) {
                            Pill(person.role, if (person.role == "admin") Brand.accent else Brand.muted)
                            Spacer(Modifier.height(4.dp))
                            Pill(person.tier, if (person.tier == "premium") Brand.ok else Brand.muted)
                        }
                    }
                    Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (person.role == "admin") {
                            ActionChip("Remove admin") { update(person.id, "role", "user", person.name) }
                        } else {
                            ActionChip("Make admin") { update(person.id, "role", "admin", person.name) }
                        }
                        if (person.tier == "premium") {
                            ActionChip("Make free") { update(person.id, "tier", "free", person.name) }
                        } else {
                            ActionChip("Grant premium") { update(person.id, "tier", "premium", person.name) }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                }
            }
        }
    }
}

private fun statusColor(status: String): Color = when (status) {
    "approved" -> Brand.ok
    "pending" -> Brand.accent
    else -> Brand.live
}

/** `2026-10-08T06:51:45.198Z` reads better as `10-08 06:51` in a list. */
private fun shortTime(iso: String): String {
    if (iso.length < 16) return iso
    return iso.substring(5, 16).replace('T', ' ')
}
