package pro.streamcast.listener

import android.Manifest
import android.view.SurfaceHolder
import android.view.SurfaceView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.launch
import org.json.JSONObject
import pro.streamcast.core.Api
import pro.streamcast.core.Brand
import pro.streamcast.core.Chip
import pro.streamcast.core.LiveBadge
import pro.streamcast.core.Notice
import pro.streamcast.core.Pill
import pro.streamcast.core.PrimaryButton
import pro.streamcast.core.QUALITY_PRESETS
import pro.streamcast.core.Station
import pro.streamcast.core.TextInput
import pro.streamcast.core.qualityPreset

/**
 * "Go live from this phone" — the studio's own broadcast, with the camera and the microphone
 * as the source. It offers the same settings the web studio and the control room do — the live
 * title, the window and the quality the station broadcasts at — and opens on the pair the
 * station already remembers, so a station set up at 1080p on the website records at 1080p here.
 *
 * It asks for the permissions it needs, opens the session and hands the recording over to
 * [LiveBroadcast]; the panel then shows the picture going out and what has been sent.
 *
 * This is the native counterpart of the web studio's LiveBroadcaster: same session, same chunk
 * endpoint, same growing file, so a broadcast started here is watched on the website and in
 * this app's listener side exactly like one started in a browser.
 */
@Composable
fun PhoneGoLive(station: Station, notify: (String) -> Unit, fail: (String) -> Unit, reload: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var title by remember(station.id) { mutableStateOf("") }
    var quality by remember(station.id) { mutableStateOf(station.quality) }
    var window by remember(station.id) { mutableStateOf(station.window) }

    val preset = qualityPreset(quality)
    val video = !preset.audioOnly

    // The station keeps what it was last set up with, so its studio on the web and this panel
    // open with the same choices. Saving is a convenience, never a reason to refuse to go live.
    fun rememberSettings() {
        val body = JSONObject().put("quality", quality).put("window", window)
        scope.launch { runCatching { Api.patch("/stations/${station.id}/stream", body) } }
    }

    val permissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted.values.all { it }) {
            rememberSettings()
            LiveBroadcast.start(
                context,
                station,
                title.trim().ifBlank { "${station.name} live" },
                window,
                quality
            )
        } else {
            fail("The microphone${if (video) " and the camera" else ""} are needed to broadcast from this phone.")
        }
    }

    // The studio's live list is the API's, so refresh it when a broadcast starts or ends here.
    var wasLive by remember { mutableStateOf(LiveBroadcast.live) }
    LaunchedEffect(LiveBroadcast.live) {
        if (wasLive != LiveBroadcast.live) {
            wasLive = LiveBroadcast.live
            reload()
        }
    }

    val live = LiveBroadcast.live
    val mb = "%.1f".format(LiveBroadcast.bytes / 1048576.0)

    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Brand.panel).padding(12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Go live from this phone",
                color = Brand.text,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f)
            )
            if (live) LiveBadge() else Pill("Device off air")
        }
        Text(
            "This phone is the source: the camera and microphone record and go straight to " +
                "${station.name}, and listeners follow along live. Keep the studio open while you broadcast.",
            color = Brand.muted,
            fontSize = 11.5.sp,
            modifier = Modifier.padding(top = 4.dp)
        )

        if (!LiveBroadcast.supported) {
            Notice(
                "Broadcasting from the phone itself needs Android 10 or newer. You can still put " +
                    "something you published on air above, or broadcast from the StreamCast website."
            )
            return
        }

        TextInput(title, { title = it }, "Live title")

        Text("Quality", color = Brand.muted, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
        Row(
            Modifier.fillMaxWidth().padding(top = 4.dp).horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            QUALITY_PRESETS.forEach { option ->
                Chip(option.label, quality == option.key) {
                    if (!live) {
                        quality = option.key
                        rememberSettings()
                    }
                }
            }
        }

        Text("How long", color = Brand.muted, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
        Row(
            Modifier.fillMaxWidth().padding(top = 4.dp).horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            WINDOWS.forEach { (value, label) ->
                Chip(label, window == value) {
                    if (!live) {
                        window = value
                        rememberSettings()
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))

        if (!live) {
            PrimaryButton(
                text = if (LiveBroadcast.busy) "Starting…" else "Go live from this phone",
                enabled = !LiveBroadcast.busy
            ) {
                val needed = if (video) {
                    arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
                } else {
                    arrayOf(Manifest.permission.RECORD_AUDIO)
                }
                permissions.launch(needed)
            }
        } else {
            // The camera's own preview: what the panel shows is the picture going out.
            if (video) {
                AndroidView(
                    factory = { ctx ->
                        SurfaceView(ctx).apply {
                            holder.addCallback(object : SurfaceHolder.Callback {
                                override fun surfaceCreated(holder: SurfaceHolder) {
                                    LiveBroadcast.attachPreview(holder)
                                }

                                override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
                                    LiveBroadcast.attachPreview(holder)
                                }

                                override fun surfaceDestroyed(holder: SurfaceHolder) {
                                    LiveBroadcast.detachPreview()
                                }
                            })
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(190.dp).clip(RoundedCornerShape(10.dp))
                )
                Text(
                    "This is the picture your viewers see.",
                    color = Brand.muted,
                    fontSize = 11.sp,
                    modifier = Modifier.padding(top = 6.dp)
                )
            }

            PrimaryButton(text = if (LiveBroadcast.busy) "Ending…" else "End broadcast", enabled = !LiveBroadcast.busy) {
                LiveBroadcast.stop(notify, fail)
            }
            Text(
                "${LiveBroadcast.chunks} slices sent · $mb MB · ${preset.label}",
                color = Brand.muted,
                fontSize = 11.sp,
                modifier = Modifier.padding(top = 6.dp)
            )
        }

        LiveBroadcast.error?.let { Notice(it, Brand.live) }
    }
}
