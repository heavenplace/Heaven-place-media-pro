package pro.streamcast.controlroom

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
import androidx.compose.foundation.rememberScrollState
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
import pro.streamcast.core.Account
import pro.streamcast.core.Brand
import pro.streamcast.core.Line
import pro.streamcast.core.Session
import pro.streamcast.core.SignInScreen

enum class Desk(val label: String) {
    Dashboard("Dashboard"),
    Stations("Stations"),
    Moderation("Moderation"),
    Live("Live"),
    Users("Users")
}

/**
 * The control room app: admins only. The listener app is the one everyone else uses —
 * this one is the moderation and content desk.
 */
@Composable
fun ControlRoomApp(session: Session) {
    var account by remember { mutableStateOf(session.account) }

    val signedIn = account
    if (signedIn == null || !signedIn.isAdmin) {
        SignInScreen(
            appName = "Control Room",
            blurb = "Sign in with an admin account to run the platform.",
            requireAdmin = true,
            allowRegister = false,
            session = session
        ) { account = it }
        return
    }

    var desk by remember { mutableStateOf(Desk.Dashboard) }

    Column(Modifier.fillMaxSize().background(Brand.bg).safeDrawingPadding()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Control", color = Brand.text, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            Text(" Room", color = Brand.accent, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Text(
                "Sign out",
                color = Brand.muted,
                fontSize = 12.sp,
                modifier = Modifier.clickable {
                    session.clear()
                    account = null
                }.padding(6.dp)
            )
        }
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 2.dp)
        ) {
            Desk.entries.forEach { entry ->
                NavChip(entry.label, entry == desk) { desk = entry }
            }
        }
        Spacer(Modifier.height(8.dp))
        Line()

        Box(Modifier.weight(1f)) {
            when (desk) {
                Desk.Dashboard -> DashboardScreen(signedIn)
                Desk.Stations -> StationsScreen()
                Desk.Moderation -> ModerationScreen()
                Desk.Live -> LiveScreen()
                Desk.Users -> UsersScreen()
            }
        }
    }
}

@Composable
private fun NavChip(text: String, active: Boolean, onClick: () -> Unit) {
    Text(
        text,
        color = if (active) Color.White else Brand.muted,
        fontSize = 12.5.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.padding(end = 6.dp).clip(RoundedCornerShape(50))
            .background(if (active) Brand.accent else Brand.panel2)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 7.dp)
    )
}

@Composable
fun ActionChip(text: String, danger: Boolean = false, onClick: () -> Unit) {
    Text(
        text,
        color = if (danger) Brand.live else Brand.text,
        fontSize = 11.5.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.clip(RoundedCornerShape(50))
            .background(if (danger) Brand.live.copy(alpha = 0.14f) else Brand.panel2)
            .clickable { onClick() }
            .padding(horizontal = 11.dp, vertical = 6.dp)
    )
}
