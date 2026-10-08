package pro.streamcast.core

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

/**
 * A screen's loaded data: `state.data`, `state.error`, and `state.reload()` after a write.
 * The properties are snapshot state, so a screen redraws when the fetch lands.
 */
class Remote<T> {
    var data: T? by mutableStateOf(null)
    var error: String? by mutableStateOf(null)
    var loading: Boolean by mutableStateOf(true)
    internal var version: Int by mutableStateOf(0)

    fun reload() {
        version += 1
    }
}

@Composable
fun <T> remote(key: Any?, fetch: suspend () -> T): Remote<T> {
    val state = remember(key) { Remote<T>() }
    LaunchedEffect(key, state.version) {
        state.loading = true
        try {
            state.data = fetch()
            state.error = null
        } catch (failure: Exception) {
            state.error = failure.message ?: "Could not load"
        }
        state.loading = false
    }
    return state
}
