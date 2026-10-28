package pro.streamcast.core

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/**
 * The sign-in screen both apps start on. Google sign-in stays a web-only flow — the
 * account form is what works offline from a browser.
 */
@Composable
fun SignInScreen(
    appName: String,
    blurb: String,
    requireAdmin: Boolean,
    allowRegister: Boolean,
    session: Session,
    onSignedIn: (Account) -> Unit
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var registering by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val ready = !busy && email.isNotBlank() && password.isNotBlank() && (!registering || name.isNotBlank())

    Column(
        Modifier.fillMaxSize().background(Brand.bg).safeDrawingPadding()
            .verticalScroll(rememberScrollState()).padding(24.dp)
    ) {
        Spacer(Modifier.height(36.dp))
        Text(appName, color = Brand.text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Text(blurb, color = Brand.muted, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp))
        Spacer(Modifier.height(26.dp))

        if (registering) Field(name, { name = it }, "Name")
        Field(email, { email = it }, "Email")
        Field(password, { password = it }, "Password", password = true)
        error?.let { Notice(it) }
        Spacer(Modifier.height(10.dp))

        PrimaryButton(
            text = if (busy) "Please wait…" else if (registering) "Create account" else "Sign in",
            enabled = ready
        ) {
            busy = true
            error = null
            scope.launch {
                try {
                    val account =
                        if (registering) Auth.register(session, name, email, password)
                        else Auth.signIn(session, email, password)
                    val problem = if (requireAdmin && !account.isAdmin) {
                        "This app is for the control room — sign in with an admin account."
                    } else null
                    if (problem != null) {
                        Auth.signOut(session)
                        error = problem
                    } else {
                        onSignedIn(account)
                    }
                } catch (failure: Exception) {
                    error = failure.message ?: "Could not sign in"
                }
                busy = false
            }
        }

        if (allowRegister) {
            Spacer(Modifier.height(10.dp))
            TextButton(onClick = { registering = !registering; error = null }) {
                Text(
                    if (registering) "I already have an account" else "Create a listener account",
                    color = Brand.accent,
                    fontSize = 13.sp
                )
            }
        }
    }
}
