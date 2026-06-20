import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { createServer } from "node:http";
import { createChisaTalkServer, readRuntimeConfig } from "./server.mjs";

let workspace;
let baseUrl;
let closeServer;
let hermesBaseUrl;
let closeHermesServer;
let hermesRequests = [];
let hermesMode = "success";
let providerBaseUrl;
let closeProviderServer;
let providerRequests = [];

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payloadText = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const payload =
    payloadText.trim().length > 0 && contentType.includes("application/json")
      ? JSON.parse(payloadText)
      : null;
  return { response, payload, text: payloadText };
}

async function login(username, password) {
  return request("/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

function parseSse(text) {
  return text
    .split("\n\n")
    .filter((chunk) => chunk.trim().length > 0)
    .map((chunk) => {
      const eventLine = chunk.split("\n").find((line) => line.startsWith("event: "));
      const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
      return {
        event: eventLine?.slice("event: ".length) ?? "message",
        data: dataLine ? JSON.parse(dataLine.slice("data: ".length)) : null,
      };
    });
}

before(async () => {
  workspace = await mkdtemp(join(tmpdir(), "chisatalk-server-"));
  const providerServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const bodyText = Buffer.concat(chunks).toString("utf8");
    providerRequests.push({
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: bodyText ? JSON.parse(bodyText) : null,
    });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        id: "chatcmpl-provider",
        choices: [
          {
            message: {
              role: "assistant",
              reasoning_content: "先读取上下文。",
              content: "来自服务端代理",
            },
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 7 },
      }),
    );
  });
  await new Promise((resolve) => providerServer.listen(0, "127.0.0.1", resolve));
  const providerAddress = providerServer.address();
  assert.equal(typeof providerAddress, "object");
  assert.notEqual(providerAddress, null);
  providerBaseUrl = `http://127.0.0.1:${providerAddress.port}/v1`;
  closeProviderServer = async () => {
    await new Promise((resolve, reject) => {
      providerServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };

  const hermesPresetPath = join(workspace, "hermes-preset.md");
  await writeFile(hermesPresetPath, "默认叙事预设：保持沉浸式连续世界。");
  const hermesServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const bodyText = Buffer.concat(chunks).toString("utf8");
    hermesRequests.push({
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: bodyText ? JSON.parse(bodyText) : null,
    });

    if (hermesMode === "failure") {
      response.writeHead(502, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: { message: "Hermes unavailable" } }));
      return;
    }

    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write(
      "data: " +
        JSON.stringify({
          id: "chatcmpl-hermes",
          choices: [{ delta: { content: "你好" } }],
        }) +
        "\n\n",
    );
    response.write(
      "event: hermes.tool.progress\n" +
        "data: " +
        JSON.stringify({ toolName: "memory", status: "running", message: "检索记忆" }) +
        "\n\n",
    );
    response.write(
      "data: " +
        JSON.stringify({
          choices: [{ delta: { reasoning_content: "先检索记忆。" } }],
        }) +
        "\n\n",
    );
    response.write(
      "data: " +
        JSON.stringify({
          choices: [{ delta: { content: "，我是 Hermes。" } }],
        }) +
        "\n\n",
    );
    response.end("data: [DONE]\n\n");
  });
  await new Promise((resolve) => hermesServer.listen(0, "127.0.0.1", resolve));
  const hermesAddress = hermesServer.address();
  assert.equal(typeof hermesAddress, "object");
  assert.notEqual(hermesAddress, null);
  hermesBaseUrl = `http://127.0.0.1:${hermesAddress.port}/v1`;
  closeHermesServer = async () => {
    await new Promise((resolve, reject) => {
      hermesServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };

  const modelsPath = join(workspace, "models.json");
  await writeFile(
    modelsPath,
    JSON.stringify({
      updatedAt: "2026-06-18T01:00:00.000Z",
      models: [
        {
          id: "glm",
          label: "GLM",
          provider: "zhipu",
          providerType: "openai-compatible",
          chatCompletionsUrl: `${providerBaseUrl}/chat/completions`,
          apiKey: "model-key",
          model: "glm-4.5",
          enabled: true,
          supportsStreaming: false,
          defaultParameters: { temperature: 0.2 },
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
    }),
  );

  const app = await createChisaTalkServer({
    databasePath: join(workspace, "chisatalk.sqlite"),
    modelsPath,
    adminUsername: "admin",
    adminPassword: "secret",
    sessionSecret: "test-secret",
    hermesApiBaseUrl: hermesBaseUrl,
    hermesApiKey: "hermes-secret",
    hermesPresetPath,
    users: [{ username: "other", password: "other-secret", displayName: "Other" }],
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.notEqual(address, null);
  baseUrl = `http://127.0.0.1:${address.port}`;
  closeServer = async () => {
    await app.closeDatabase();
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };
});

after(async () => {
  await closeServer();
  await closeHermesServer();
  await closeProviderServer();
  await rm(workspace, { recursive: true, force: true });
});

describe("chisatalk server", () => {
  it("reads additional users from CHISATALK_USERS_JSON", () => {
    const config = readRuntimeConfig({
      CHISATALK_DATABASE_PATH: "/tmp/chisatalk.sqlite",
      CHISATALK_MODELS_PATH: "/tmp/models.json",
      CHISATALK_SESSION_SECRET: "secret",
      CHISATALK_USERS_JSON: JSON.stringify([
        { username: "Ayase", password: "a114477652", displayName: "Ayase" },
      ]),
    });

    assert.deepEqual(config.users, [
      { username: "Ayase", password: "a114477652", displayName: "Ayase" },
    ]);
  });

  it("logs in with valid credentials and rejects invalid credentials", async () => {
    const ok = await login("admin", "secret");
    assert.equal(ok.response.status, 200);
    assert.equal(typeof ok.payload.accessToken, "string");
    assert.equal(ok.payload.user.username, "admin");

    const bad = await login("admin", "bad");
    assert.equal(bad.response.status, 401);
    assert.equal(bad.payload.error.code, "invalid_credentials");
    assert.equal(typeof bad.payload.error.requestId, "string");
  });

  it("requires authentication for models and never returns provider secrets", async () => {
    const rejected = await request("/v1/models");
    assert.equal(rejected.response.status, 401);

    const loggedIn = await login("admin", "secret");
    const models = await request("/v1/models", {
      headers: { Authorization: `Bearer ${loggedIn.payload.accessToken}` },
    });

    assert.equal(models.response.status, 200);
    assert.equal(models.payload.models[0].providerType, "openai-compatible");
    assert.equal("apiKey" in models.payload.models[0], false);
    assert.equal("chatCompletionsUrl" in models.payload.models[0], false);
    const hermes = models.payload.models.find((model) => model.id === "hermes");
    assert.equal(hermes.providerType, "hermes-agent");
    assert.equal(hermes.supportsStreaming, true);
    assert.equal("apiKey" in hermes, false);
    assert.equal("chatCompletionsUrl" in hermes, false);
  });

  it("rate limits repeated invalid login attempts", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const bad = await login("missing", "bad");
      assert.equal(bad.response.status, 401);
      assert.equal(bad.payload.error.code, "invalid_credentials");
    }

    const limited = await login("missing", "bad");
    assert.equal(limited.response.status, 429);
    assert.equal(limited.payload.error.code, "too_many_login_attempts");
  });

  it("creates conversations, writes messages, and updates conversation time", async () => {
    const loggedIn = await login("admin", "secret");
    const auth = { Authorization: `Bearer ${loggedIn.payload.accessToken}` };

    const created = await request("/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "测试会话", modelId: "glm" }),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.payload.conversation.title, "测试会话");

    const beforeUpdate = created.payload.conversation.updatedAt;
    const message = await request(`/v1/conversations/${created.payload.conversation.id}/messages`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "user",
        content: "你好",
        modelId: "glm",
        clientMessageId: "client-1",
        providerMeta: { local: true },
      }),
    });
    assert.equal(message.response.status, 201);
    assert.equal(message.payload.message.content, "你好");
    assert.notEqual(message.payload.conversation.updatedAt, beforeUpdate);

    const detail = await request(`/v1/conversations/${created.payload.conversation.id}`, {
      headers: auth,
    });
    assert.equal(detail.payload.messages.length, 1);
  });

  it("proxies an OpenAI-compatible turn without exposing the provider key to the client", async () => {
    providerRequests = [];
    const loggedIn = await login("admin", "secret");
    const auth = { Authorization: `Bearer ${loggedIn.payload.accessToken}` };

    const created = await request("/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "代理会话", modelId: "glm" }),
    });

    const turn = await request(`/v1/conversations/${created.payload.conversation.id}/chat-completions`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "你好",
        modelId: "glm",
        clientMessageId: "client-provider-1",
        systemPrompt: "你是 ChisaTalk。",
      }),
    });

    assert.equal(turn.response.status, 200);
    assert.equal(turn.payload.userMessage.content, "你好");
    assert.equal(turn.payload.assistantMessage.content, "来自服务端代理");
    assert.deepEqual(turn.payload.assistantMessage.providerMeta, {
      source: "openai-compatible",
      upstreamId: "chatcmpl-provider",
      reasoningContent: "先读取上下文。",
      usage: { prompt_tokens: 5, completion_tokens: 7 },
    });

    assert.equal(providerRequests.length, 1);
    assert.equal(providerRequests[0].url, "/v1/chat/completions");
    assert.equal(providerRequests[0].headers.authorization, "Bearer model-key");
    assert.equal(providerRequests[0].body.model, "glm-4.5");
    assert.equal(providerRequests[0].body.messages[0].role, "system");
    assert.equal(providerRequests[0].body.messages[0].content, "你是 ChisaTalk。");

    const detail = await request(`/v1/conversations/${created.payload.conversation.id}`, {
      headers: auth,
    });
    assert.equal(detail.payload.messages.length, 2);
    assert.equal(detail.payload.messages[0].role, "user");
    assert.equal(detail.payload.messages[1].role, "assistant");
  });

  it("edits the latest user message and regenerates the following assistant answer", async () => {
    providerRequests = [];
    const loggedIn = await login("admin", "secret");
    const auth = { Authorization: `Bearer ${loggedIn.payload.accessToken}` };

    const created = await request("/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "编辑会话", modelId: "glm" }),
    });
    const firstTurn = await request(`/v1/conversations/${created.payload.conversation.id}/chat-completions`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "原问题",
        modelId: "glm",
        clientMessageId: "client-edit-1",
        providerMeta: { source: "test" },
        systemPrompt: "你是 ChisaTalk。",
      }),
    });

    const editedTurn = await request(`/v1/conversations/${created.payload.conversation.id}/chat-completions`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "修改后的问题",
        modelId: "glm",
        clientMessageId: "client-edit-2",
        editMessageId: firstTurn.payload.userMessage.id,
        systemPrompt: "你是 ChisaTalk。",
      }),
    });

    assert.equal(editedTurn.response.status, 200);
    assert.equal(editedTurn.payload.userMessage.id, firstTurn.payload.userMessage.id);
    assert.equal(editedTurn.payload.userMessage.content, "修改后的问题");
    assert.equal(editedTurn.payload.assistantMessage.content, "来自服务端代理");

    const detail = await request(`/v1/conversations/${created.payload.conversation.id}`, {
      headers: auth,
    });
    assert.deepEqual(
      detail.payload.messages.map((message) => [message.role, message.content]),
      [
        ["user", "修改后的问题"],
        ["assistant", "来自服务端代理"],
      ],
    );
    assert.equal(providerRequests.at(-1).body.messages.at(-1).content, "修改后的问题");
  });

  it("rejects editing a user message that is no longer the latest user message", async () => {
    const loggedIn = await login("admin", "secret");
    const auth = { Authorization: `Bearer ${loggedIn.payload.accessToken}` };

    const created = await request("/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "编辑限制", modelId: "glm" }),
    });
    const firstTurn = await request(`/v1/conversations/${created.payload.conversation.id}/chat-completions`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "第一问",
        modelId: "glm",
        clientMessageId: "client-edit-limit-1",
        systemPrompt: "你是 ChisaTalk。",
      }),
    });
    await request(`/v1/conversations/${created.payload.conversation.id}/chat-completions`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "第二问",
        modelId: "glm",
        clientMessageId: "client-edit-limit-2",
        systemPrompt: "你是 ChisaTalk。",
      }),
    });

    const rejected = await request(`/v1/conversations/${created.payload.conversation.id}/chat-completions`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "尝试修改第一问",
        modelId: "glm",
        clientMessageId: "client-edit-limit-3",
        editMessageId: firstTurn.payload.userMessage.id,
        systemPrompt: "你是 ChisaTalk。",
      }),
    });

    assert.equal(rejected.response.status, 422);
    assert.equal(rejected.payload.error.code, "validation_failed");
  });

  it("isolates conversations between users", async () => {
    const admin = await login("admin", "secret");
    const created = await request("/v1/conversations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin.payload.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "私有会话", modelId: "glm" }),
    });

    const other = await login("other", "other-secret");
    const forbidden = await request(`/v1/conversations/${created.payload.conversation.id}`, {
      headers: { Authorization: `Bearer ${other.payload.accessToken}` },
    });

    assert.equal(forbidden.response.status, 404);
  });

  it("archives conversations so deleted items leave the list and cannot be opened", async () => {
    const loggedIn = await login("admin", "secret");
    const auth = { Authorization: `Bearer ${loggedIn.payload.accessToken}` };

    const created = await request("/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "待删除会话", modelId: "glm" }),
    });
    assert.equal(created.response.status, 201);

    const archived = await request(`/v1/conversations/${created.payload.conversation.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    assert.equal(archived.response.status, 200);
    assert.equal(archived.payload.conversation.archived, true);

    const listed = await request("/v1/conversations?limit=50", { headers: auth });
    assert.equal(
      listed.payload.items.some((conversation) => conversation.id === created.payload.conversation.id),
      false,
    );

    const detail = await request(`/v1/conversations/${created.payload.conversation.id}`, {
      headers: auth,
    });
    assert.equal(detail.response.status, 404);
  });

  it("streams a Hermes agent turn, forwards scoped headers, and persists messages", async () => {
    hermesRequests = [];
    hermesMode = "success";
    const loggedIn = await login("admin", "secret");
    const auth = { Authorization: `Bearer ${loggedIn.payload.accessToken}` };

    const created = await request("/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Hermes 会话", modelId: "hermes" }),
    });

    const streamed = await request(`/v1/conversations/${created.payload.conversation.id}/agent-turns/stream`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "你好",
        modelId: "hermes",
        clientMessageId: "client-hermes-1",
        providerMeta: { source: "test" },
        systemPrompt: "你是 ChisaTalk。",
      }),
    });

    assert.equal(streamed.response.status, 200);
    assert.equal(streamed.response.headers.get("content-type").includes("text/event-stream"), true);
    const events = parseSse(streamed.text);
    assert.deepEqual(
      events.map((event) => event.event),
      ["user_message", "assistant_delta", "tool_progress", "assistant_delta", "assistant_message", "done"],
    );
    assert.equal(events[1].data.delta, "你好");
    assert.equal(events[2].data.toolName, "memory");
    assert.equal(events[3].data.delta, "，我是 Hermes。");
    assert.equal(events[4].data.message.content, "你好，我是 Hermes。");

    assert.equal(hermesRequests.length, 1);
    assert.equal(hermesRequests[0].url, "/v1/chat/completions");
    assert.equal(hermesRequests[0].headers.authorization, "Bearer hermes-secret");
    assert.equal(
      hermesRequests[0].headers["x-hermes-session-id"],
      `chisatalk-conversation-${created.payload.conversation.id}`,
    );
    assert.equal(hermesRequests[0].headers["x-hermes-session-key"], "chisatalk-user-admin");
    assert.equal(hermesRequests[0].body.stream, true);
    assert.equal(hermesRequests[0].body.messages[0].role, "system");
    assert.equal(hermesRequests[0].body.messages[0].content, "默认叙事预设：保持沉浸式连续世界。");
    assert.equal(hermesRequests[0].body.messages[1].content, "你是 ChisaTalk。");
    assert.equal(
      hermesRequests[0].body.messages.some((message) => {
        return message.role === "system" && message.content.includes("联网搜索") && message.content.includes("已同意");
      }),
      true,
    );
    assert.equal(
      hermesRequests[0].body.messages.some((message) => {
        return (
          message.role === "system" &&
          message.content.includes("天气") &&
          message.content.includes("明天") &&
          message.content.includes("必须先联网搜索")
        );
      }),
      true,
    );

    const detail = await request(`/v1/conversations/${created.payload.conversation.id}`, {
      headers: auth,
    });
    assert.equal(detail.payload.messages.length, 2);
    assert.equal(detail.payload.messages[0].role, "user");
    assert.equal(detail.payload.messages[1].role, "assistant");
    assert.equal(detail.payload.messages[1].content, "你好，我是 Hermes。");
    assert.equal(detail.payload.messages[1].providerMeta.reasoningContent, "先检索记忆。");
  });

  it("streams an error and does not persist an empty assistant message when Hermes fails", async () => {
    hermesRequests = [];
    hermesMode = "failure";
    const loggedIn = await login("admin", "secret");
    const auth = { Authorization: `Bearer ${loggedIn.payload.accessToken}` };

    const created = await request("/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Hermes 失败", modelId: "hermes" }),
    });

    const streamed = await request(`/v1/conversations/${created.payload.conversation.id}/agent-turns/stream`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "失败测试",
        modelId: "hermes",
        clientMessageId: "client-hermes-fail",
        systemPrompt: "你是 ChisaTalk。",
      }),
    });

    assert.equal(streamed.response.status, 200);
    const events = parseSse(streamed.text);
    assert.equal(events.at(-1).event, "error");
    assert.equal(events.at(-1).data.code, "hermes_request_failed");

    const detail = await request(`/v1/conversations/${created.payload.conversation.id}`, {
      headers: auth,
    });
    assert.equal(detail.payload.messages.length, 1);
    assert.equal(detail.payload.messages[0].role, "user");
  });
});
