package pro.streamcast.listener

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import pro.streamcast.core.Api
import pro.streamcast.core.Session
import pro.streamcast.core.StreamCastTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.baseUrl = BuildConfig.API_BASE_URL
        val session = Session(this, "streamcast.listener")
        setContent {
            StreamCastTheme {
                ListenerApp(session)
            }
        }
    }
}
