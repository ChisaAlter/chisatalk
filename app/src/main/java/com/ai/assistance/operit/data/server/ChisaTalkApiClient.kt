package com.ai.assistance.operit.data.server

import android.content.Context
import com.ai.assistance.operit.BuildConfig
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

data class ServerModel(
    val id: String,
    val displayName: String,
    val description: String,
    val capabilities: List<String>,
    val enabled: Boolean
)

class ChisaTalkApiClient private constructor(
    private val appContext: Context,
    private val client: OkHttpClient = OkHttpClient()
) {
    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()

        @Volatile private var INSTANCE: ChisaTalkApiClient? = null

        fun getInstance(context: Context): ChisaTalkApiClient {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: ChisaTalkApiClient(context.applicationContext).also { INSTANCE = it }
            }
        }
    }

    val serverBaseUrl: String =
        BuildConfig.CHISATALK_SERVER_BASE_URL.trim().trimEnd('/')

    private fun requireServerBaseUrl(): String {
        if (serverBaseUrl.isBlank()) {
            throw IllegalStateException("CHISATALK_SERVER_BASE_URL 未配置")
        }
        return serverBaseUrl
    }

    suspend fun login(username: String, password: String): ChisaTalkAuthSession =
        withContext(Dispatchers.IO) {
            val body =
                JSONObject()
                    .put("username", username)
                    .put("password", password)
                    .toString()
                    .toRequestBody(JSON)
            val request =
                Request.Builder()
                    .url("${requireServerBaseUrl()}/v1/auth/login")
                    .post(body)
                    .build()
            client.newCall(request).execute().use { response ->
                val responseText = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    throw IOException("登录失败：HTTP ${response.code} $responseText")
                }
                val json = JSONObject(responseText)
                val token = json.getString("accessToken")
                val userJson = json.getJSONObject("user")
                ChisaTalkAuthSession(
                    accessToken = token,
                    user =
                        ChisaTalkUser(
                            id = userJson.getString("id"),
                            username = userJson.getString("username"),
                            displayName = userJson.getString("displayName")
                        )
                )
            }
        }

    suspend fun me(accessToken: String): ChisaTalkUser =
        withContext(Dispatchers.IO) {
            val request =
                authorizedRequestBuilder("${requireServerBaseUrl()}/v1/auth/me", accessToken)
                    .get()
                    .build()
            client.newCall(request).execute().use { response ->
                val responseText = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    throw IOException("会话校验失败：HTTP ${response.code} $responseText")
                }
                val json = JSONObject(responseText)
                val userJson = json.optJSONObject("user") ?: json
                ChisaTalkUser(
                    id = userJson.getString("id"),
                    username = userJson.getString("username"),
                    displayName = userJson.getString("displayName")
                )
            }
        }

    suspend fun logout(accessToken: String) {
        withContext(Dispatchers.IO) {
            val request =
                authorizedRequestBuilder("${requireServerBaseUrl()}/v1/auth/logout", accessToken)
                    .post(ByteArray(0).toRequestBody(null))
                    .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    val responseText = response.body?.string().orEmpty()
                    throw IOException("退出登录失败：HTTP ${response.code} $responseText")
                }
            }
        }
    }

    suspend fun getModels(accessToken: String): List<ServerModel> =
        withContext(Dispatchers.IO) {
            val request =
                authorizedRequestBuilder("${requireServerBaseUrl()}/v1/models", accessToken)
                    .get()
                    .build()
            client.newCall(request).execute().use { response ->
                val responseText = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    throw IOException("获取模型列表失败：HTTP ${response.code} $responseText")
                }
                val json = JSONObject(responseText)
                val models = json.getJSONArray("models")
                List(models.length()) { index ->
                    val item = models.getJSONObject(index)
                    val capabilitiesJson = item.optJSONArray("capabilities") ?: JSONArray()
                    ServerModel(
                        id = item.getString("id"),
                        displayName = item.getString("displayName"),
                        description = item.optString("description", ""),
                        capabilities =
                            List(capabilitiesJson.length()) { capabilityIndex ->
                                capabilitiesJson.getString(capabilityIndex)
                            },
                        enabled = item.optBoolean("enabled", true)
                    )
                }.filter { model -> model.enabled }
            }
        }

    fun chatStreamRequest(accessToken: String, requestBody: JSONObject): Request {
        return authorizedRequestBuilder("${requireServerBaseUrl()}/v1/chat/stream", accessToken)
            .post(requestBody.toString().toRequestBody(JSON))
            .build()
    }

    fun newCall(request: Request) = client.newCall(request)

    private fun authorizedRequestBuilder(url: String, accessToken: String): Request.Builder {
        return Request.Builder()
            .url(url)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("Accept", "application/json")
    }
}
