package com.ai.assistance.operit.api.chat.enhance

import android.content.Context
import com.ai.assistance.operit.api.chat.llmprovider.AIService
import com.ai.assistance.operit.api.chat.llmprovider.ServerAIService
import com.ai.assistance.operit.data.model.ApiProviderType
import com.ai.assistance.operit.data.model.FunctionType
import com.ai.assistance.operit.data.model.ModelConfigData
import com.ai.assistance.operit.data.model.ModelParameter
import com.ai.assistance.operit.data.preferences.FunctionalConfigManager
import com.ai.assistance.operit.data.server.ServerModelRepository
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** 管理 ChisaTalk 服务器代理模型服务。 */
class MultiServiceManager(private val context: Context) {
    private val functionalConfigManager = FunctionalConfigManager(context)
    private val serverModelRepository = ServerModelRepository.getInstance(context)
    private val serviceInstances = mutableMapOf<String, AIService>()
    private val serviceMutex = Mutex()
    private val initMutex = Mutex()

    @Volatile private var isInitialized = false

    suspend fun initialize() {
        ensureInitialized()
    }

    private suspend fun ensureInitialized() {
        if (isInitialized) return
        initMutex.withLock {
            if (isInitialized) return
            functionalConfigManager.initializeIfNeeded()
            isInitialized = true
        }
    }

    suspend fun getServiceForFunction(functionType: FunctionType): AIService {
        ensureInitialized()
        val mapping = functionalConfigManager.getConfigMappingForFunction(functionType)
        return getServiceForModelId(resolveServerModelId(mapping.configId))
    }

    suspend fun getServiceForConfig(configId: String, modelIndex: Int): AIService {
        ensureInitialized()
        return getServiceForModelId(resolveServerModelId(configId))
    }

    suspend fun getDefaultService(): AIService {
        return getServiceForFunction(FunctionType.CHAT)
    }

    suspend fun cancelAllStreaming() {
        serviceMutex.withLock {
            serviceInstances.values.forEach { service -> service.cancelStreaming() }
        }
    }

    suspend fun resetAllTokenCounters() {
        serviceMutex.withLock {
            serviceInstances.values.forEach { service -> service.resetTokenCounts() }
        }
    }

    suspend fun resetTokenCountersForFunction(functionType: FunctionType) {
        getServiceForFunction(functionType).resetTokenCounts()
    }

    suspend fun refreshServiceForFunction(functionType: FunctionType) {
        ensureInitialized()
        serviceMutex.withLock {
            serviceInstances.values.forEach { service ->
                service.cancelStreaming()
                service.release()
            }
            serviceInstances.clear()
        }
    }

    suspend fun refreshAllServices() {
        ensureInitialized()
        serviceMutex.withLock {
            serviceInstances.values.forEach { service ->
                service.cancelStreaming()
                service.release()
            }
            serviceInstances.clear()
        }
    }

    suspend fun getModelParametersForFunction(functionType: FunctionType): List<ModelParameter<*>> {
        ensureInitialized()
        return emptyList()
    }

    suspend fun getModelConfigForFunction(functionType: FunctionType): ModelConfigData {
        ensureInitialized()
        val mapping = functionalConfigManager.getConfigMappingForFunction(functionType)
        return serverModelConfig(mapping.configId)
    }

    suspend fun getModelConfigForConfig(configId: String): ModelConfigData {
        ensureInitialized()
        return serverModelConfig(configId)
    }

    suspend fun getModelParametersForConfig(configId: String): List<ModelParameter<*>> {
        ensureInitialized()
        return emptyList()
    }

    suspend fun hasImageRecognitionConfigured(): Boolean {
        ensureInitialized()
        return false
    }

    suspend fun hasAudioRecognitionConfigured(): Boolean {
        ensureInitialized()
        return false
    }

    suspend fun hasVideoRecognitionConfigured(): Boolean {
        ensureInitialized()
        return false
    }

    private suspend fun getServiceForModelId(modelId: String): AIService {
        val normalizedModelId = modelId.trim()
        return serviceMutex.withLock {
            serviceInstances[normalizedModelId]?.let { service -> return@withLock service }
            val service = ServerAIService(context.applicationContext, normalizedModelId)
            serviceInstances[normalizedModelId] = service
            service
        }
    }

    private suspend fun resolveServerModelId(requestedModelId: String): String {
        val models = serverModelRepository.getModels()
        if (models.any { model -> model.id == requestedModelId }) {
            return requestedModelId
        }
        val firstModel = models.firstOrNull()
        if (firstModel != null) {
            return firstModel.id
        }
        return requestedModelId
    }

    private fun serverModelConfig(modelId: String): ModelConfigData {
        return ModelConfigData(
            id = modelId,
            name = modelId,
            modelName = modelId,
            apiKey = "",
            apiEndpoint = "",
            apiProviderType = ApiProviderType.OTHER,
            apiProviderTypeId = "CHISATALK_SERVER",
            enableToolCall = false
        )
    }
}
