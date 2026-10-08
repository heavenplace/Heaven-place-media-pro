package pro.streamcast.core

import org.json.JSONObject

/** The API rows the two apps read, parsed once so screens stay short. */

data class Station(
    val id: Int,
    val name: String,
    val kind: String,
    val description: String,
    val artwork: String?,
    val status: String,
    val verified: Boolean,
    val owner: String?,
    val mediaCount: Int,
    val live: Boolean
) {
    val isTv: Boolean get() = kind == "tv"
}

data class MediaItem(
    val id: Int,
    val stationId: Int,
    val title: String,
    val description: String,
    val type: String,
    val url: String,
    val source: String,
    val access: String,
    val priceCents: Int,
    val durationSeconds: Int,
    val visible: Boolean,
    val flagged: Boolean,
    val stationName: String?,
    val artwork: String?
) {
    val isVideo: Boolean get() = type == "video"
    val isPremium: Boolean get() = access == "premium"
}

/** What the persistent player holds, whether it came from media or a live window. */
data class Playable(
    val key: String,
    val title: String,
    val subtitle: String,
    val artwork: String?,
    val url: String,
    val video: Boolean,
    val live: Boolean,
    val mediaId: Int?
)

data class LiveSession(
    val id: Int,
    val stationId: Int,
    val stationName: String,
    val stationArtwork: String?,
    val title: String,
    val kind: String,
    val status: String,
    val recordingUrl: String?,
    val mediaUrl: String?,
    val mediaType: String?,
    val permanent: Boolean
) {
    val video: Boolean get() = (mediaType ?: kind) == "video"

    /** A window over a published item plays that item; a phone broadcast plays the file. */
    fun toPlayable(): Playable? {
        val path = mediaUrl ?: recordingUrl ?: return null
        return Playable(
            key = "live-$id",
            title = title,
            subtitle = "$stationName · on air",
            artwork = stationArtwork,
            url = Api.absolute(path) ?: return null,
            video = video,
            live = true,
            mediaId = null
        )
    }
}

data class Podcast(
    val id: Int,
    val title: String,
    val description: String,
    val artwork: String?,
    val owner: String?,
    val episodeCount: Int
)

/** Podcast episodes live in their own table, not in `media`. */
data class Episode(
    val id: Int,
    val podcastId: Int,
    val title: String,
    val description: String,
    val url: String,
    val durationSeconds: Int
)

data class AdminActivity(
    val id: Int,
    val type: String,
    val detail: String,
    val userName: String?,
    val stationName: String?,
    val createdAt: String
)

data class AdminUser(
    val id: Int,
    val name: String,
    val email: String,
    val role: String,
    val tier: String,
    val unlocks: Int,
    val lastSeen: String?
)

data class Overview(
    val stations: Int,
    val pendingStations: Int,
    val users: Int,
    val media: Int,
    val podcasts: Int,
    val liveNow: Int,
    val activeListeners: Int,
    val pendingRequests: Int,
    val unlocks: Int
)

fun stationOf(row: JSONObject) = Station(
    id = row.optInt("id"),
    name = row.optString("name"),
    kind = row.optString("kind", "radio"),
    description = row.optString("description"),
    artwork = row.optString("artwork_url").takeIf { it.isNotBlank() },
    status = row.optString("status", "pending"),
    verified = row.optBoolean("verified"),
    owner = row.optString("owner_name").takeIf { it.isNotBlank() },
    mediaCount = row.optInt("media_count"),
    live = row.optBoolean("is_live")
)

fun mediaOf(row: JSONObject) = MediaItem(
    id = row.optInt("id"),
    stationId = row.optInt("station_id"),
    title = row.optString("title"),
    description = row.optString("description"),
    type = row.optString("type", "audio"),
    url = row.optString("url"),
    source = row.optString("source", "upload"),
    access = row.optString("access", "free"),
    priceCents = row.optInt("price_cents"),
    durationSeconds = row.optInt("duration_seconds"),
    visible = row.optBoolean("visible", true),
    flagged = row.optBoolean("flagged"),
    stationName = row.optString("station_name").takeIf { it.isNotBlank() },
    artwork = row.optString("station_artwork").takeIf { it.isNotBlank() }
)

fun liveOf(row: JSONObject) = LiveSession(
    id = row.optInt("id"),
    stationId = row.optInt("station_id"),
    stationName = row.optString("station_name"),
    stationArtwork = row.optString("station_artwork").takeIf { it.isNotBlank() },
    title = row.optString("title"),
    kind = row.optString("kind", "audio"),
    status = row.optString("status", "live"),
    recordingUrl = row.optString("recording_url").takeIf { it.isNotBlank() },
    mediaUrl = row.optString("media_url").takeIf { it.isNotBlank() },
    mediaType = row.optString("media_type").takeIf { it.isNotBlank() },
    permanent = row.optBoolean("permanent")
)

fun podcastOf(row: JSONObject) = Podcast(
    id = row.optInt("id"),
    title = row.optString("title"),
    description = row.optString("description"),
    artwork = row.optString("artwork_url").takeIf { it.isNotBlank() },
    owner = row.optString("owner_name").takeIf { it.isNotBlank() },
    episodeCount = row.optInt("episode_count")
)

fun episodeOf(row: JSONObject) = Episode(
    id = row.optInt("id"),
    podcastId = row.optInt("podcast_id"),
    title = row.optString("title"),
    description = row.optString("description"),
    url = row.optString("url"),
    durationSeconds = row.optInt("duration_seconds")
)

fun Episode.toPlayable(show: String, artwork: String?) = Playable(
    key = "episode-$id",
    title = title,
    subtitle = show,
    artwork = artwork,
    url = Api.absolute(url) ?: "",
    video = false,
    live = false,
    mediaId = null
)

fun activityOf(row: JSONObject) = AdminActivity(
    id = row.optInt("id"),
    type = row.optString("type"),
    detail = row.optString("detail"),
    userName = row.optString("user_name").takeIf { it.isNotBlank() },
    stationName = row.optString("station_name").takeIf { it.isNotBlank() },
    createdAt = row.optString("created_at")
)

fun adminUserOf(row: JSONObject) = AdminUser(
    id = row.optInt("id"),
    name = row.optString("name"),
    email = row.optString("email"),
    role = row.optString("role", "user"),
    tier = row.optString("tier", "free"),
    unlocks = row.optInt("unlocks"),
    lastSeen = row.optString("last_seen").takeIf { it.isNotBlank() }
)

fun overviewOf(row: JSONObject) = Overview(
    stations = row.optInt("stations"),
    pendingStations = row.optInt("pending_stations"),
    users = row.optInt("users"),
    media = row.optInt("media"),
    podcasts = row.optInt("podcasts"),
    liveNow = row.optInt("live_now"),
    activeListeners = row.optInt("active_listeners"),
    pendingRequests = row.optInt("pending_requests"),
    unlocks = row.optInt("unlocks")
)

/** A published item, ready for the player. */
fun MediaItem.toPlayable(station: String? = null) = Playable(
    key = "media-$id",
    title = title,
    subtitle = station ?: stationName ?: type.replaceFirstChar { it.uppercase() },
    artwork = artwork,
    url = Api.absolute(url) ?: "",
    video = isVideo,
    live = false,
    mediaId = id
)
