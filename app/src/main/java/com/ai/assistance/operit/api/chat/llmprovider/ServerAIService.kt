package com.ai.assistance.operit.api.chat.llmprovider

import android.content.Context
import com.ai.assistance.operit.core.chat.hooks.PromptTurn
import com.ai.assistance.operit.data.model.ModelOption
import com.ai.assistance.operit.data.model.ModelParameter
import com.ai.assistance.operit.data.model.ToolPrompt
import com.ai.assistance.operit.data.server.AuthPreferences
import com.ai.assistance.operit.data.server.ChisaTalkApiClient
import com.ai.assistance.operit.data.server.ServerModelRepository
import com.ai.assistance.operit.util.ChatUtils
import com.ai.assistance.operit.util.stream.Stream
import com.ai.assistance.operit.util.stream.stream
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Call
import org.json.JSONArray
import org.json.JSONObject

class ServerAIService(
    private val context: Context,
    private val modelId: String
) : AIService {
    private val apiClient = ChisaTalkApiClient.getInstance(context)
    private val authPreferences = AuthPreferences.getInstance(context)
    private val modelRepository = ServerModelRepository.getInstance(context)

    @Volatile private var activeCall: Call? = null
    private var inputTokens = 0
    private var outputTokens = 0

    override val inputTokenCount: Int
        get() = inputTokens

    override val cachedInputTokenCount: Int
        get() = 0

    override val outputTokenCount: Int
        get() = outputTokens

    override val providerModel: String
        get() = "CHISATALK:$modelId"

    override fun resetTokenCounts() {
        inputTokens = 0
        outputTokens = 0
    }

    override fun cancelStreaming() {
        activeCall?.cancel()
        activeCall = null
    }

    override suspend fun getModelsList(context: Context): Result<List<ModelOption>> {
        return runCatching {
            modelRepository.refreshModels().map { model ->
                ModelOption(id = model.id, name = model.displayName)
            }
        }
    }

    override suspend fun sendMessage(
        context: Context,
        chatHistory: List<PromptTurn>,
        modelParameters: List<ModelParameter<*>>,
        enableThinking: Boolean,
        stream: Boolean,
        availableTools: List<ToolPrompt>?,
        preserveThinkInHistory: Boolean,
        onTokensUpdated: suspend (input: Int, cachedInput: Int, output: Int) -> Unit,
        onNonFatalError: suspend (error: String) -> Unit,
        enableRetry: Boolean
    ): Stream<String> {
        return stream {
            val responseCollector = this
            val authState = authPreferences.currentState()
            if (!authState.isLoggedIn) {
                throw IOException("请先登录 ChisaTalk")
            }
            if (modelId.isBlank()) {
                throw IOException("请选择服务器模型")
            }

            inputTokens = calculateInputTokens(chatHistory, availableTools)
            outputTokens = 0
            onTokensUpdated(inputTokens, 0, outputTokens)

            val requestJson = buildChatRequest(chatHistory, stream)
            val request = apiClient.chatStreamRequest(authState.accessToken, requestJson)
            val call = apiClient.newCall(request)
            activeCall = call

            withContext(Dispatchers.IO) {
                call.execute().use { response ->
                    val body = response.body ?: throw IOException("服务器响应为空")
                    if (!response.isSuccessful) {
                        throw IOException("聊天请求失败：HTTP ${response.code} ${body.string()}")
                    }
                    val reader = body.charStream().buffered()
                    streamLoop@ while (true) {
                        val line = reader.readLine() ?: break@streamLoop
                        if (!line.startsWith("data:")) {
                            continue
                        }
                        val payload = line.removePrefix("data:").trim()
                        if (payload == "[DONE]") {
                            break@streamLoop
                        }
                        val event = JSONObject(payload)
                        when (event.getString("type")) {
                            "delta" -> {
                                val content = event.getString("content")
                                outputTokens += ChatUtils.estimateTokenCount(content)
                                responseCollector.emit(content)
                                onTokensUpdated(inputTokens, 0, outputTokens)
                            }
                            "usage" -> {
                                inputTokens = event.optInt("inputTokens", inputTokens)
                                outputTokens = event.optInt("outputTokens", outputTokens)
                                onTokensUpdated(inputTokens, 0, outputTokens)
                            }
                            "error" -> throw IOException(event.getString("message"))
                            "done" -> break@streamLoop
                        }
                    }
                }
            }
            activeCall = null
        }
    }

    override suspend fun testConnection(context: Context): Result<String> {
        return runCatching {
            val authState = authPreferences.currentState()
            if (!authState.isLoggedIn) {
                throw IOException("请先登录 ChisaTalk")
            }
            apiClient.getModels(authState.accessToken)
            "ChisaTalk server connected"
        }
    }

    override suspend fun calculateInputTokens(
        chatHistory: List<PromptTurn>,
        availableTools: List<ToolPrompt>?
    ): Int {
        val messageTokens = chatHistory.sumOf { turn -> ChatUtils.estimateTokenCount(turn.content) }
        val toolTokens = availableTools.orEmpty().sumOf { tool -> ChatUtils.estimateTokenCount(tool.name) }
        return messageTokens + toolTokens
    }

    private fun buildChatRequest(chatHistory: List<PromptTurn>, stream: Boolean): JSONObject {
        val messages = JSONArray()
        chatHistory.forEach { turn ->
            messages.put(
                JSONObject()
                    .put("role", turn.role)
                    .put("content", turn.content)
            )
        }
        return JSONObject()
            .put("modelId", modelId)
            .put("messages", messages)
            .put("options", JSONObject().put("stream", stream))
            .put("attachments", JSONArray())
            .put(
                "toolContext",
                JSONObject().put(
                    "allowedTools",
                    JSONArray(
                        listOf(
                            "visit_web",
                            "read_file",
                            "read_file_part",
                            "read_file_full",
                            "query_memory",
                            "calculate"
                        )
                    )
                )
            )
    }
}
