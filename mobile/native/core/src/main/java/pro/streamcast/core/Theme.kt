package pro.streamcast.core

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** The app's palette — the same dark/orange look as the web app. */
object Brand {
    val bg = Color(0xFF0C0D10)
    val panel = Color(0xFF16171C)
    val panel2 = Color(0xFF1F2026)
    val line = Color(0xFF2A2C33)
    val text = Color(0xFFF2F3F5)
    val muted = Color(0xFF9AA0AA)
    val accent = Color(0xFFFF5733)
    val live = Color(0xFFE23B3B)
    val ok = Color(0xFF3DBE7B)
}

@Composable
fun StreamCastTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Brand.accent,
            onPrimary = Color.White,
            background = Brand.bg,
            onBackground = Brand.text,
            surface = Brand.panel,
            onSurface = Brand.text,
            surfaceVariant = Brand.panel2,
            onSurfaceVariant = Brand.muted,
            outline = Brand.line,
            error = Brand.live
        ),
        content = content
    )
}
