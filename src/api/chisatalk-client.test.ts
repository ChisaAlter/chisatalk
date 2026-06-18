import { describe, expect, it, vi } from "vitest";
import {
  ChisaTalkApiError,
  createConversation,
  createMessage,
  getConversation,
  getCurrentUser,
  getModels,
  listConversations,
  login,
  updateConversation,
  createChatCompletion,
  type ChisaTalkFetch,
} from "./chisatalk-client";

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("chisatalk-client", () => {
  it("posts credentials and returns the access token with user data", async () => {
    const fetcher = vi.fn<ChisaTalkFetch>().mockResolvedValue(
      jsonResponse({
        accessToken: "token-123",
        user: { id: "admin", username: "admin", displayName: "Admin" },
      }),
    );

    const result = await login({ username: "admin", password: "secret" }, fetcher);

    expect(result).toEqual({
      accessToken: "token-123",
      user: { id: "admin", username: "admin", displayName: "Admin" },
    });
    expect(fetcher).toHaveBeenCalledWith("https://38.76.185.154:8789/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "secret" }),
    });
  });

  it("sends bearer token when loading the current user", async () => {
    const fetcher = vi.fn<ChisaTalkFetch>().mockResolvedValue(
      jsonResponse({
        user: { id: "admin", username: "admin", displayName: "Admin" },
      }),
    );

    const user = await getCurrentUser("token-123", fetcher);

    expect(user.displayName).toBe("Admin");
    expect(fetcher).toHaveBeenCalledWith("https://38.76.185.154:8789/v1/auth/me", {
      method: "GET",
      headers: { Authorization: "Bearer token-123" },
    });
  });

  it("returns the model list from the server response", async () => {
    const fetcher = vi.fn<ChisaTalkFetch>().mockResolvedValue(
      jsonResponse({
        models: [
          {
            id: "glm",
            label: "GLM",
            provider: "zhipu",
            providerType: "openai-compatible",
            model: "glm-4.5",
            enabled: true,
            supportsStreaming: false,
            defaultParameters: { temperature: 0.2, max_tokens: 1024 },
          },
          {
            id: "hermes",
            label: "Hermes Agent",
            provider: "hermes",
            providerType: "hermes-agent",
            model: "hermes-agent",
            enabled: true,
            supportsStreaming: true,
            description: "Agent with tools and memory",
            defaultParameters: { temperature: 0.1 },
          },
        ],
        updatedAt: "2026-06-18T01:00:00.000Z",
      }),
    );

    const models = await getModels("token-123", fetcher);

    expect(models).toEqual([
      {
        id: "glm",
        label: "GLM",
        provider: "zhipu",
        providerType: "openai-compatible",
        model: "glm-4.5",
        enabled: true,
        supportsStreaming: false,
        defaultParameters: { temperature: 0.2, max_tokens: 1024 },
      },
      {
        id: "hermes",
        label: "Hermes Agent",
        provider: "hermes",
        providerType: "hermes-agent",
        model: "hermes-agent",
        enabled: true,
        supportsStreaming: true,
        description: "Agent with tools and memory",
        defaultParameters: { temperature: 0.1 },
      },
    ]);
  });

  it("lists conversations with an optional cursor", async () => {
    const fetcher = vi.fn<ChisaTalkFetch>().mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: "conv-1",
            title: "新的会话",
            userId: "admin",
            modelId: "glm",
            archived: false,
            createdAt: "2026-06-18T01:00:00.000Z",
            updatedAt: "2026-06-18T01:01:00.000Z",
          },
        ],
        nextCursor: "cursor-2",
      }),
    );

    const result = await listConversations(
      "token-123",
      { limit: 25, cursor: "cursor-1" },
      fetcher,
    );

    expect(result.nextCursor).toBe("cursor-2");
    expect(result.items[0]?.title).toBe("新的会话");
    expect(fetcher).toHaveBeenCalledWith(
      "https://38.76.185.154:8789/v1/conversations?limit=25&cursor=cursor-1",
      {
        method: "GET",
        headers: { Authorization: "Bearer token-123" },
      },
    );
  });

  it("creates and updates conversations", async () => {
    const conversation = {
      id: "conv-1",
      title: "新对话",
      userId: "admin",
      modelId: "glm",
      archived: false,
      createdAt: "2026-06-18T01:00:00.000Z",
      updatedAt: "2026-06-18T01:00:00.000Z",
    };
    const createFetcher = vi.fn<ChisaTalkFetch>().mockResolvedValue(jsonResponse({ conversation }, 201));
    const updateFetcher = vi.fn<ChisaTalkFetch>().mockResolvedValue(
      jsonResponse({ conversation: { ...conversation, title: "改名" } }),
    );

    await expect(
      createConversation("token-123", { title: "新对话", modelId: "glm" }, createFetcher),
    ).resolves.toEqual(conversation);
    await expect(
      updateConversation("token-123", "conv-1", { title: "改名", archived: false }, updateFetcher),
    ).resolves.toMatchObject({ title: "改名" });

    expect(createFetcher).toHaveBeenCalledWith(
      "https://38.76.185.154:8789/v1/conversations",
      {
        method: "POST",
        headers: { Authorization: "Bearer token-123", "Content-Type": "application/json" },
        body: JSON.stringify({ title: "新对话", modelId: "glm" }),
      },
    );
  });

  it("loads a conversation with messages and writes a new message", async () => {
    const conversation = {
      id: "conv-1",
      title: "新对话",
      userId: "admin",
      modelId: "glm",
      archived: false,
      createdAt: "2026-06-18T01:00:00.000Z",
      updatedAt: "2026-06-18T01:00:00.000Z",
    };
    const message = {
      id: "msg-1",
      conversationId: "conv-1",
      role: "user",
      content: "你好",
      modelId: "glm",
      clientMessageId: "client-1",
      providerMeta: { promptTokens: 2 },
      createdAt: "2026-06-18T01:00:01.000Z",
    };
    const getFetcher = vi.fn<ChisaTalkFetch>().mockResolvedValue(
      jsonResponse({ conversation, messages: [message] }),
    );
    const postFetcher = vi.fn<ChisaTalkFetch>().mockResolvedValue(
      jsonResponse({ message, conversation }, 201),
    );

    await expect(getConversation("token-123", "conv-1", getFetcher)).resolves.toEqual({
      conversation,
      messages: [message],
    });
    await expect(
      createMessage(
        "token-123",
        "conv-1",
        {
          role: "user",
          content: "你好",
          modelId: "glm",
          clientMessageId: "client-1",
          providerMeta: { promptTokens: 2 },
        },
        postFetcher,
      ),
    ).resolves.toEqual({ message, conversation });
  });

  it("creates a proxied chat completion through ChisaTalk Server", async () => {
    const conversation = {
      id: "conv-1",
      title: "代理会话",
      userId: "admin",
      modelId: "glm",
      archived: false,
      createdAt: "2026-06-18T01:00:00.000Z",
      updatedAt: "2026-06-18T01:00:02.000Z",
    };
    const userMessage = {
      id: "msg-user",
      conversationId: "conv-1",
      role: "user",
      content: "你好",
      modelId: "glm",
      clientMessageId: "client-1",
      providerMeta: { source: "mobile" },
      createdAt: "2026-06-18T01:00:01.000Z",
    };
    const assistantMessage = {
      id: "msg-assistant",
      conversationId: "conv-1",
      role: "assistant",
      content: "你好，我是 ChisaTalk。",
      modelId: "glm",
      clientMessageId: "server-1",
      providerMeta: { source: "openai-compatible" },
      createdAt: "2026-06-18T01:00:02.000Z",
    };
    const fetcher = vi.fn<ChisaTalkFetch>().mockResolvedValue(
      jsonResponse({ userMessage, assistantMessage, conversation }),
    );

    await expect(
      createChatCompletion(
        "token-123",
        "conv-1",
        {
          content: "你好",
          modelId: "glm",
          clientMessageId: "client-1",
          providerMeta: { source: "mobile" },
          systemPrompt: "你是 ChisaTalk。",
        },
        fetcher,
      ),
    ).resolves.toEqual({ userMessage, assistantMessage, conversation });

    expect(fetcher).toHaveBeenCalledWith(
      "https://38.76.185.154:8789/v1/conversations/conv-1/chat-completions",
      {
        method: "POST",
        headers: { Authorization: "Bearer token-123", "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "你好",
          modelId: "glm",
          clientMessageId: "client-1",
          providerMeta: { source: "mobile" },
          systemPrompt: "你是 ChisaTalk。",
        }),
      },
    );
  });

  it("throws a typed api error for rejected requests", async () => {
    const fetcher = vi.fn<ChisaTalkFetch>().mockResolvedValue(
      jsonResponse(
        { error: { code: "invalid_credentials", message: "账号或密码错误", requestId: "req_1" } },
        401,
      ),
    );

    await expect(login({ username: "admin", password: "bad" }, fetcher)).rejects.toMatchObject({
      status: 401,
      code: "invalid_credentials",
      message: "账号或密码错误",
    } satisfies Partial<ChisaTalkApiError>);
  });
});
