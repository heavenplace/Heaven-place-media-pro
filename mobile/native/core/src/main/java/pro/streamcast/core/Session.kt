package pro.streamcast.core

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

data class Account(val id: Int, val email: String, val name: String, val role: String, val tier: String) {
    val isAdmin: Boolean get() = role == "admin"
    val isPremium: Boolean get() = tier == "premium" || isAdmin
}

/** Keeps the signed-in account and its bearer token between launches. */
class Session(context: Context, store: String) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(store, Context.MODE_PRIVATE)

    init {
        Api.token = prefs.getString("token", null)
    }

    val account: Account?
        get() = prefs.getString("user", null)?.let { raw ->
            runCatching {
                val row = JSONObject(raw)
                Account(
                    row.optInt("id"),
                    row.optString("email"),
                    row.optString("name"),
                    row.optString("role", "user"),
                    row.optString("tier", "free")
                )
            }.getOrNull()
        }

    fun save(token: String, user: JSONObject) {
        prefs.edit().putString("token", token).putString("user", user.toString()).apply()
        Api.token = token
    }

    fun clear() {
        prefs.edit().clear().apply()
        Api.token = null
    }
}
