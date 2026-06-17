package com.ai.assistance.operit.data.server

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.ai.assistance.operit.util.AppLogger
import java.io.IOException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private val Context.chisaTalkAuthDataStore: DataStore<Preferences> by
    preferencesDataStore(name = "chisatalk_auth")

@Serializable
data class ChisaTalkUser(
    val id: String,
    val username: String,
    val displayName: String
)

@Serializable
data class ChisaTalkAuthSession(
    val accessToken: String,
    val user: ChisaTalkUser
)

data class ChisaTalkAuthState(
    val accessToken: String = "",
    val user: ChisaTalkUser? = null
) {
    val isLoggedIn: Boolean
        get() = accessToken.isNotBlank() && user != null
}

class AuthPreferences private constructor(private val context: Context) {
    companion object {
        private const val TAG = "AuthPreferences"
        private val ACCESS_TOKEN_KEY = stringPreferencesKey("access_token")
        private val USER_JSON_KEY = stringPreferencesKey("user_json")

        @Volatile private var INSTANCE: AuthPreferences? = null

        fun getInstance(context: Context): AuthPreferences {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: AuthPreferences(context.applicationContext).also { INSTANCE = it }
            }
        }
    }

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    val authStateFlow: Flow<ChisaTalkAuthState> =
        context.chisaTalkAuthDataStore.data
            .catch { error ->
                if (error is IOException) {
                    AppLogger.e(TAG, "读取登录状态失败", error)
                    emit(emptyPreferences())
                } else {
                    throw error
                }
            }
            .map { preferences ->
                val token = preferences[ACCESS_TOKEN_KEY].orEmpty()
                val userJson = preferences[USER_JSON_KEY].orEmpty()
                val user =
                    if (userJson.isNotBlank()) {
                        try {
                            json.decodeFromString<ChisaTalkUser>(userJson)
                        } catch (e: Exception) {
                            AppLogger.e(TAG, "解析用户信息失败", e)
                            null
                        }
                    } else {
                        null
                    }
                ChisaTalkAuthState(accessToken = token, user = user)
            }

    suspend fun currentState(): ChisaTalkAuthState {
        return authStateFlow.first()
    }

    suspend fun saveSession(session: ChisaTalkAuthSession) {
        context.chisaTalkAuthDataStore.edit { preferences ->
            preferences[ACCESS_TOKEN_KEY] = session.accessToken
            preferences[USER_JSON_KEY] = json.encodeToString(session.user)
        }
    }

    suspend fun updateUser(user: ChisaTalkUser) {
        context.chisaTalkAuthDataStore.edit { preferences ->
            preferences[USER_JSON_KEY] = json.encodeToString(user)
        }
    }

    suspend fun logout() {
        context.chisaTalkAuthDataStore.edit { preferences ->
            preferences.clear()
        }
    }
}
