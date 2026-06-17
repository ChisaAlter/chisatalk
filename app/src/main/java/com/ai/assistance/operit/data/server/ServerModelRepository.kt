package com.ai.assistance.operit.data.server

import android.content.Context
import com.ai.assistance.operit.data.model.ModelConfigSummary
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class ServerModelRepository private constructor(private val context: Context) {
    companion object {
        @Volatile private var INSTANCE: ServerModelRepository? = null

        fun getInstance(context: Context): ServerModelRepository {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: ServerModelRepository(context.applicationContext).also { INSTANCE = it }
            }
        }
    }

    private val apiClient = ChisaTalkApiClient.getInstance(context)
    private val authPreferences = AuthPreferences.getInstance(context)
    private val cacheMutex = Mutex()
    private var cachedModels: List<ServerModel> = emptyList()

    suspend fun refreshModels(): List<ServerModel> {
        val authState = authPreferences.currentState()
        if (!authState.isLoggedIn) {
            return emptyList()
        }
        val models = apiClient.getModels(authState.accessToken)
        cacheMutex.withLock {
            cachedModels = models
        }
        return models
    }

    suspend fun getModels(): List<ServerModel> {
        val cached = cacheMutex.withLock { cachedModels }
        if (cached.isNotEmpty()) {
            return cached
        }
        return refreshModels()
    }

    suspend fun getModelSummaries(): List<ModelConfigSummary> {
        return getModels().map { model ->
            ModelConfigSummary(
                id = model.id,
                name = model.displayName,
                modelName = model.displayName,
                apiEndpoint = ""
            )
        }
    }
}
