package pro.streamcast.core

import org.json.JSONObject

/** Email + password sign in and sign up, kept in [Session]. */
object Auth {
    suspend fun signIn(session: Session, email: String, password: String): Account {
        val body = JSONObject().put("email", email.trim()).put("password", password)
        val response = Api.post("/auth/login", body)
        val token = response.optString("token")
        val user = response.optJSONObject("user") ?: JSONObject()
        if (token.isBlank()) throw ApiException("Sign in failed")
        session.save(token, user)
        return session.account ?: throw ApiException("Sign in failed")
    }

    suspend fun register(session: Session, name: String, email: String, password: String): Account {
        val body = JSONObject()
            .put("name", name.trim())
            .put("email", email.trim())
            .put("password", password)
        val response = Api.post("/auth/register", body)
        val token = response.optString("token")
        val user = response.optJSONObject("user") ?: JSONObject()
        if (token.isBlank()) throw ApiException("Could not create the account")
        session.save(token, user)
        return session.account ?: throw ApiException("Could not create the account")
    }

    /** Confirms a stored token is still good — used on launch. */
    suspend fun refresh(session: Session): Account? =
        runCatching {
            val token = Api.token ?: return@runCatching null
            val row = Api.get("/auth/me").optJSONObject("user") ?: return@runCatching null
            session.save(token, row)
            session.account
        }.getOrNull()

    fun signOut(session: Session) = session.clear()
}
