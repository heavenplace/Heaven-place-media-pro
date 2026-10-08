package pro.streamcast.core

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions
import coil.compose.AsyncImage

/** Small building blocks both apps share, so screens stay short. */

@Composable
fun Artwork(url: String?, glyph: String, size: Dp = 52.dp, radius: Dp = 10.dp) {
    Box(
        Modifier.size(size).clip(RoundedCornerShape(radius)).background(Brand.panel2),
        contentAlignment = Alignment.Center
    ) {
        if (url.isNullOrBlank()) {
            Text(glyph, color = Brand.muted, fontSize = (size.value / 2.4f).sp)
        } else {
            AsyncImage(
                model = Api.absolute(url),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

@Composable
fun Banner(url: String?, glyph: String, height: Dp = 170.dp) {
    Box(Modifier.fillMaxWidth().height(height).background(Brand.panel2), contentAlignment = Alignment.Center) {
        if (url.isNullOrBlank()) {
            Text(glyph, color = Brand.muted, fontSize = 40.sp)
        } else {
            AsyncImage(
                model = Api.absolute(url),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

@Composable
fun LiveBadge(label: String = "Live") {
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(Brand.live.copy(alpha = 0.18f))
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(Brand.live))
        Spacer(Modifier.width(5.dp))
        Text(label.uppercase(), color = Brand.live, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun Pill(text: String, color: Color = Brand.muted) {
    Text(
        text,
        color = color,
        fontSize = 10.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(Brand.panel2)
            .padding(horizontal = 7.dp, vertical = 2.dp)
    )
}

/** A tappable pill: nav links, tab bars and pickers all use the same shape. */
@Composable
fun Chip(text: String, active: Boolean = false, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Text(
        text,
        color = if (active) Color.White else Brand.muted,
        fontSize = 12.5.sp,
        fontWeight = FontWeight.Medium,
        maxLines = 1,
        modifier = modifier.clip(RoundedCornerShape(50))
            .background(if (active) Brand.accent else Brand.panel2)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 7.dp)
    )
}

/** The accent label the web hero and cards use, e.g. "Streaming free for everyone". */
@Composable
fun AccentBadge(text: String) {
    Text(
        text,
        color = Brand.accent,
        fontSize = 10.5.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.clip(RoundedCornerShape(50))
            .background(Brand.accent.copy(alpha = 0.14f))
            .padding(horizontal = 10.dp, vertical = 4.dp)
    )
}

@Composable
fun SectionTitle(text: String) {
    Text(
        text.uppercase(),
        color = Brand.muted,
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(top = 18.dp, bottom = 8.dp)
    )
}

@Composable
fun Line() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(Brand.line))
}

@Composable
fun Message(text: String, tone: Color = Brand.muted) {
    Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
        Text(text, color = tone, fontSize = 13.sp)
    }
}

@Composable
fun Notice(text: String, tone: Color = Brand.accent) {
    Box(
        Modifier.fillMaxWidth().padding(vertical = 8.dp).clip(RoundedCornerShape(10.dp))
            .background(tone.copy(alpha = 0.12f)).padding(10.dp)
    ) {
        Text(text, color = tone, fontSize = 12.sp)
    }
}

/** A tappable row card: artwork, two lines of text, optional trailing content. */
@Composable
fun RowCard(onClick: () -> Unit, trailing: @Composable (RowScope.() -> Unit)? = null, content: @Composable RowScope.() -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Brand.panel)
            .clickable { onClick() }.padding(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        content()
        if (trailing != null) trailing()
    }
}

@Composable
fun RowText(title: String, subtitle: String?, modifier: Modifier = Modifier) {
    Column(modifier.padding(horizontal = 10.dp)) {
        Text(
            title,
            color = Brand.text,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
        if (!subtitle.isNullOrBlank()) {
            Text(
                subtitle,
                color = Brand.muted,
                fontSize = 11.5.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp)
            )
        }
    }
}

@Composable
fun PrimaryButton(text: String, enabled: Boolean = true, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().height(46.dp),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Brand.accent, contentColor = Color.White)
    ) {
        Text(text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
    }
}

@Composable
fun Field(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    password: Boolean = false
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label, fontSize = 13.sp) },
        singleLine = true,
        textStyle = TextStyle(fontSize = 14.sp, color = Brand.text),
        keyboardOptions = KeyboardOptions(keyboardType = if (password) KeyboardType.Password else KeyboardType.Email),
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp)
    )
}

/** A free-text field — the studio's titles, descriptions and prices. */
@Composable
fun TextInput(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    keyboard: KeyboardType = KeyboardType.Text,
    singleLine: Boolean = true
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label, fontSize = 13.sp) },
        singleLine = singleLine,
        textStyle = TextStyle(fontSize = 14.sp, color = Brand.text),
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp)
    )
}

/** Formats a duration in seconds the way the web player does. */
fun clock(seconds: Long): String {
    val total = if (seconds < 0) 0 else seconds
    val hours = total / 3600
    val minutes = (total % 3600) / 60
    val secs = total % 60
    return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, secs) else "%d:%02d".format(minutes, secs)
}
