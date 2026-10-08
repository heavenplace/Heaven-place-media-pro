package pro.streamcast.listener

import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import pro.streamcast.core.Account
import pro.streamcast.core.Artwork
import pro.streamcast.core.Brand
import pro.streamcast.core.Chip
import pro.streamcast.core.Line
import pro.streamcast.core.LiveBadge
import pro.streamcast.core.Session
import pro.streamcast.core.SignInScreen

sealed interface Screen {
    data object Home : Screen
    data class Browse(val kind: String) : Screen
    data object Podcasts : Screen
    data class Station(val id: Int) : Screen
    data object NowPlaying : Screen
    data object Account : Screen
    data object Studio : Screen
}

/** The listener app: sign in once, then browse and play behind one persistent player. */
@Composable
fun ListenerApp(session: Session) {
    var account by remember { mutableStateOf(session.account) }
    val context = LocalContext.current

    val signedIn = account
    if (signedIn == null) {
        SignInScreen(
            appName = "StreamCast Pro",
            blurb = "Radio, TV and podcasts — live and on demand.",
            requireAdmin = false,
            allowRegister = true,
            session = session
        ) { account = it }
        return
    }

    var screen by remember { mutableStateOf<Screen>(Screen.Home) }
    val stack = remember { mutableStateListOf<Screen>() }
    val go: (Screen) -> Unit = { next ->
        stack.add(screen)
        screen = next
    }
    val back: () -> Unit = {
        screen = if (stack.isEmpty()) Screen.Home else stack.removeAt(stack.lastIndex)
    }

    BackHandler(enabled = stack.isNotEmpty() || screen != Screen.Home) { back() }

    LaunchedEffect(PlayerController.current) {
        while (PlayerController.current != null) {
            PlayerController.tick()
            delay(500)
        }
    }

    Column(Modifier.fillMaxSize().background(Brand.bg).safeDrawingPadding()) {
        TopBar(screen, signedIn, go)
        Box(Modifier.weight(1f)) {
            when (val current = screen) {
                is Screen.Home -> HomeScreen(go, context)
                is Screen.Browse -> BrowseScreen(current.kind, go, context)
                is Screen.Podcasts -> PodcastsScreen(context)
                is Screen.Station -> StationScreen(current.id, signedIn, go, context)
                is Screen.NowPlaying -> NowPlayingScreen(context)
                is Screen.Studio -> StudioScreen()
                is Screen.Account -> AccountScreen(signedIn) {
                    PlayerController.stop()
                    session.clear()
                    stack.clear()
                    screen = Screen.Home
                    account = null
                }
            }
        }
        PlayerBar(context) { go(Screen.NowPlaying) }
    }
}

@Composable
private fun TopBar(screen: Screen, account: Account, go: (Screen) -> Unit) {
    Column(Modifier.fillMaxWidth().background(Brand.bg)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("StreamCast", color = Brand.text, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            Text(" Pro", color = Brand.accent, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Text(
                account.name.take(16),
                color = Brand.muted,
                fontSize = 12.sp,
                modifier = Modifier.clickable { go(Screen.Account) }.padding(6.dp)
            )
        }
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 2.dp)
        ) {
            NavChip("Home", screen is Screen.Home) { go(Screen.Home) }
            NavChip("Radio", screen is Screen.Browse && screen.kind == "radio") { go(Screen.Browse("radio")) }
            NavChip("TV", screen is Screen.Browse && screen.kind == "tv") { go(Screen.Browse("tv")) }
            NavChip("Podcasts", screen is Screen.Podcasts) { go(Screen.Podcasts) }
            NavChip("Studio", screen is Screen.Studio) { go(Screen.Studio) }
            NavChip("Account", screen is Screen.Account) { go(Screen.Account) }
        }
        Spacer(Modifier.height(8.dp))
        Line()
    }
}

@Composable
private fun NavChip(text: String, active: Boolean, onClick: () -> Unit) =
    Chip(text, active, Modifier.padding(end = 6.dp), onClick)

@Composable
fun CircleButton(glyph: String, filled: Boolean, size: Dp = 42.dp, onClick: () -> Unit) {
    Box(
        Modifier.size(size).clip(CircleShape)
            .background(if (filled) Brand.accent else Brand.panel2)
            .clickable { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Text(glyph, color = if (filled) Color.White else Brand.text, fontSize = (size.value / 2.7f).sp)
    }
}

/** The bar that keeps whatever is playing within reach on every screen. */
@Composable
private fun PlayerBar(context: Context, onOpen: () -> Unit) {
    val item = PlayerController.current ?: return
    val total = PlayerController.totalSeconds

    Column(Modifier.fillMaxWidth().background(Brand.panel)) {
        if (total > 0) {
            val fraction = (PlayerController.elapsedMs / 1000f / total).coerceIn(0f, 1f)
            Box(Modifier.fillMaxWidth().height(2.dp).background(Brand.line)) {
                Box(Modifier.fillMaxWidth(fraction).height(2.dp).background(Brand.accent))
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Artwork(item.artwork, if (item.video) "🎬" else "♪", size = 46.dp)
            Row(
                Modifier.weight(1f).padding(horizontal = 10.dp).clickable { onOpen() },
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        item.title,
                        color = Brand.text,
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (item.live) {
                            LiveBadge()
                            Spacer(Modifier.width(6.dp))
                        }
                        Text(
                            item.subtitle,
                            color = Brand.muted,
                            fontSize = 11.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
            CircleButton(if (PlayerController.playing) "❚❚" else "▶", true) {
                PlayerController.toggle(context)
            }
            Spacer(Modifier.width(8.dp))
            CircleButton("✕", false) { PlayerController.stop() }
        }
    }
}
