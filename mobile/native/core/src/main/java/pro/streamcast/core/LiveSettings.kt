package pro.streamcast.core

/**
 * The live-settings vocabulary, mirroring `web/src/liveSettings.js` — the studio, the control
 * room and this app offer the same choices, and a station remembers the one it was last set
 * up with, so it goes live the same way wherever it is started.
 *
 * The size, frame rate and bit rates are what the phone's `MediaRecorder` is built with.
 */
data class QualityPreset(
    val key: String,
    val label: String,
    val width: Int = 0,
    val height: Int = 0,
    val frameRate: Int = 30,
    val videoBits: Int = 1_500_000,
    val audioBits: Int = 192_000,
    val audioOnly: Boolean = false
)

val QUALITY_PRESETS = listOf(
    QualityPreset("audio", "Audio only (FM / radio)", audioBits = 192_000, audioOnly = true),
    QualityPreset("720p", "HD 720p · 30fps", width = 1280, height = 720, frameRate = 30, videoBits = 3_500_000, audioBits = 128_000),
    QualityPreset("1080p", "Full HD 1080p · 30fps", width = 1920, height = 1080, frameRate = 30, videoBits = 6_000_000, audioBits = 192_000),
    QualityPreset("1080p60", "Full HD 1080p · 60fps", width = 1920, height = 1080, frameRate = 60, videoBits = 9_000_000, audioBits = 192_000),
    QualityPreset("4k", "4K 2160p · 30fps", width = 3840, height = 2160, frameRate = 30, videoBits = 16_000_000, audioBits = 256_000)
)

/** The live windows a station can run, matching the ones the web studio offers. */
val LIVE_WINDOW_KEYS = listOf("1", "4", "12", "24", "permanent")

/** A preset by key, falling back to the one every phone can record. */
fun qualityPreset(key: String?): QualityPreset =
    QUALITY_PRESETS.firstOrNull { it.key == key } ?: QUALITY_PRESETS.first { it.key == "1080p" }
