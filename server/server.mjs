import { createHmac, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";
import { readRuntimeConfig } from "./lib/config.mjs";
import { loadDatabase, persistDatabase, run, selectAll, selectOne } from "./lib/database.mjs";
import { buildGitHubLookupSystemMessage } from "./lib/github-lookup.mjs";
import { assertModelExists, getModelConfig, loadVisibleModels } from "./lib/models.mjs";

const require = createRequire(import.meta.url);
const SQL_WASM_PATH = require.resolve("sql.js/dist/sql-wasm.wasm");
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 1024 * 1024;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const HERMES_SEARCH_CONSENT_PROMPT =
  [
    "用户已同意 Hermes Agent 在需要时直接使用联网搜索工具获取公开信息；不要再询问是否同意联网搜索。",
    "凡是涉及天气、预报、今天、明天、昨天、本周、近期、最新、新闻、价格、政策、法规、库存、版本、日程、赛事、汇率等可能随时间变化的内容，必须先联网搜索或调用可用搜索工具核对当前信息，再基于搜索结果回答。",
    "凡是涉及 GitHub、GitLab、仓库、repo、项目主页、源码地址、开源项目是否存在、star 数、issue、release、README 或代码位置的问题，必须优先调用 web_search 查询公开网页或 GitHub 页面；不要凭记忆回答，也不要改用 execute_code 运行 curl 或脚本来替代 web_search。",
    "回答这类时效问题时，不要凭模型记忆或旧上下文直接给结论；如果搜索工具不可用，应明确说明无法实时核验。",
  ].join("\n");

let lastTimestampMs = 0;
const failedLoginAttempts = new Map();

function nowIso() {
  const current = Date.now();
  lastTimestampMs = current > lastTimestampMs ? current : lastTimestampMs + 1;
  return new Date(lastTimestampMs).toISOString();
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestId() {
  return `req_${randomBytes(8).toString("hex")}`;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, status, code, message, id) {
  sendJson(response, status, { error: { code, message, requestId: id } });
}

function hashToken(token, secret) {
  return createHmac("sha256", secret).update(token).digest("hex");
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const iterations = 100000;
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const [algorithm, iterationsText, salt, expectedHex] = storedHash.split("$");
  if (algorithm !== "pbkdf2_sha256") {
    return false;
  }

  const iterations = Number.parseInt(iterationsText, 10);
  const expected = Buffer.from(expectedHex, "hex");
  const actual = pbkdf2Sync(password, salt, iterations, expected.length, "sha256");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function getBearerToken(request) {
  const authorization = request.headers.authorization;
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return null;
  }
  return authorization.slice("Bearer ".length).trim();
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;

  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      throw Object.assign(new Error("请求体过大"), { status: 413, code: "body_too_large" });
    }
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("[ChisaTalkServer] JSON parse failed", error);
    throw Object.assign(new Error("请求体不是有效 JSON"), { status: 400, code: "invalid_json" });
  }
}

function requireString(record, key) {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw Object.assign(new Error(`${key} 必须是非空字符串`), {
      status: 422,
      code: "validation_failed",
    });
  }
  return value.trim();
}

function optionalString(record, key) {
  const value = record[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw Object.assign(new Error(`${key} 格式不正确`), {
      status: 422,
      code: "validation_failed",
    });
  }
  return value.trim();
}

function optionalBoolean(record, key) {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw Object.assign(new Error(`${key} 必须是布尔值`), {
      status: 422,
      code: "validation_failed",
    });
  }
  return value;
}

function normalizeProviderMeta(value) {
  if (value === undefined) {
    return null;
  }
  JSON.stringify(value);
  return value;
}

function decodeCursor(cursor) {
  if (!cursor) {
    return null;
  }
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (!isRecord(parsed) || typeof parsed.updatedAt !== "string" || typeof parsed.id !== "string") {
      throw new Error("cursor shape");
    }
    return parsed;
  } catch (error) {
    console.error("[ChisaTalkServer] Cursor parse failed", error);
    throw Object.assign(new Error("cursor 格式不正确"), {
      status: 422,
      code: "validation_failed",
    });
  }
}

function encodeCursor(conversation) {
  return Buffer.from(
    JSON.stringify({ updatedAt: conversation.updatedAt, id: conversation.id }),
    "utf8",
  ).toString("base64url");
}

function rowToUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
  };
}

function rowToConversation(row) {
  return {
    id: row.id,
    title: row.title,
    userId: row.user_id,
    modelId: row.model_id,
    archived: row.archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    modelId: row.model_id,
    clientMessageId: row.client_message_id,
    providerMeta: row.provider_meta ? JSON.parse(row.provider_meta) : null,
    createdAt: row.created_at,
  };
}

async function initializeSchema(db, databasePath) {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      model_id TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, archived, updated_at, id);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model_id TEXT,
      client_message_id TEXT,
      provider_meta TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at, id);
  `);
  await persistDatabase(db, databasePath);
}

async function ensureUser(db, databasePath, input) {
  const existing = selectOne(db, "SELECT * FROM users WHERE username = ?", [input.username]);
  if (existing) {
    return;
  }

  const createdAt = nowIso();
  await run(
    db,
    databasePath,
    "INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)",
    [input.username, input.username, hashPassword(input.password), input.displayName, createdAt],
  );
}

async function insertMessage(db, databasePath, conversationId, input) {
  const createdAt = nowIso();
  const messageId = randomUUID();
  const providerMeta = normalizeProviderMeta(input.providerMeta);

  await run(
    db,
    databasePath,
    `
      INSERT INTO messages (id, conversation_id, role, content, model_id, client_message_id, provider_meta, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      messageId,
      conversationId,
      input.role,
      input.content,
      input.modelId,
      input.clientMessageId,
      providerMeta === null ? null : JSON.stringify(providerMeta),
      createdAt,
    ],
  );
  await run(db, databasePath, "UPDATE conversations SET updated_at = ?, model_id = ? WHERE id = ?", [
    nowIso(),
    input.modelId,
    conversationId,
  ]);

  const message = selectOne(db, "SELECT * FROM messages WHERE id = ?", [messageId]);
  const conversation = selectOne(db, "SELECT * FROM conversations WHERE id = ?", [conversationId]);
  return {
    message: rowToMessage(message),
    conversation: rowToConversation(conversation),
  };
}

async function updateUserMessageForRegeneration(db, databasePath, conversationId, input) {
  const row = selectOne(
    db,
    "SELECT * FROM messages WHERE id = ? AND conversation_id = ?",
    [input.messageId, conversationId],
  );
  if (!row || row.role !== "user") {
    throw Object.assign(new Error("只能修改用户消息"), {
      status: 422,
      code: "validation_failed",
    });
  }

  const latestUserRow = selectOne(
    db,
    `
      SELECT * FROM messages
      WHERE conversation_id = ? AND role = 'user'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [conversationId],
  );
  if (!latestUserRow || latestUserRow.id !== row.id) {
    throw Object.assign(new Error("只能修改最后一条用户消息"), {
      status: 422,
      code: "validation_failed",
    });
  }

  const existingMessage = rowToMessage(row);
  if (input.content.length === 0 && readImageAttachments(existingMessage.providerMeta).length === 0) {
    throw Object.assign(new Error("content 必须是非空字符串"), {
      status: 422,
      code: "validation_failed",
    });
  }

  await run(
    db,
    databasePath,
    `
      DELETE FROM messages
      WHERE conversation_id = ?
        AND (created_at > ? OR (created_at = ? AND id > ?))
    `,
    [conversationId, row.created_at, row.created_at, row.id],
  );
  await run(
    db,
    databasePath,
    "UPDATE messages SET content = ?, model_id = ?, client_message_id = ? WHERE id = ?",
    [input.content, input.modelId, input.clientMessageId, row.id],
  );
  await run(db, databasePath, "UPDATE conversations SET updated_at = ?, model_id = ? WHERE id = ?", [
    nowIso(),
    input.modelId,
    conversationId,
  ]);

  const message = selectOne(db, "SELECT * FROM messages WHERE id = ?", [row.id]);
  const conversation = selectOne(db, "SELECT * FROM conversations WHERE id = ?", [conversationId]);
  return {
    message: rowToMessage(message),
    conversation: rowToConversation(conversation),
  };
}

function getHermesApiBaseUrl(options) {
  return (options.hermesApiBaseUrl ?? "http://127.0.0.1:8642/v1").replace(/\/+$/, "");
}

async function readHermesPreset(options) {
  if (!options.hermesPresetPath) {
    return "";
  }

  const text = await readFile(resolve(options.hermesPresetPath), "utf8");
  return text.trim();
}

function writeSse(response, event, data) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function parseSseBlock(block) {
  let event = "message";
  const dataLines = [];

  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim() || "message";
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return { event, data: dataLines.join("\n") };
}

async function* readSseEvents(body) {
  if (!body) {
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = parseSseBlock(block);
      if (event) {
        yield event;
      }
    }
  }

  buffer += decoder.decode();
  const trailing = parseSseBlock(buffer);
  if (trailing) {
    yield trailing;
  }
}

function getAssistantDelta(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return "";
  }

  const choice = payload.choices[0];
  if (!isRecord(choice) || !isRecord(choice.delta)) {
    return "";
  }

  return typeof choice.delta.content === "string" ? choice.delta.content : "";
}

function getAssistantReasoningDelta(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return "";
  }

  const choice = payload.choices[0];
  if (!isRecord(choice) || !isRecord(choice.delta)) {
    return "";
  }

  const candidates = [
    choice.delta.reasoning_content,
    choice.delta.reasoningContent,
    choice.delta.reasoning,
    choice.delta.thinking,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return "";
}

function normalizeApprovalCommand(content) {
  const normalized = content.trim().toLowerCase();
  if (["批准", "同意", "允许", "/approve", "approve", "approved", "allow"].includes(normalized)) {
    return { choice: "once" };
  }
  if (["本次批准", "批准一次", "/approve once", "approve once"].includes(normalized)) {
    return { choice: "once" };
  }
  if (["本会话批准", "会话批准", "批准本会话", "/approve session", "approve session"].includes(normalized)) {
    return { choice: "session" };
  }
  if (["永久批准", "总是批准", "/approve always", "approve always"].includes(normalized)) {
    return { choice: "always" };
  }
  if (["拒绝", "否决", "不批准", "/deny", "deny"].includes(normalized)) {
    return { choice: "deny" };
  }
  return null;
}

function buildHermesInstructions(systemMessages) {
  return systemMessages.map((message) => message.content).join("\n\n").trim();
}

function toHermesRunHistory(messages) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: typeof message.content === "string" ? message.content : JSON.stringify(message.content),
    }));
}

function getHermesRunId(payload) {
  if (!isRecord(payload)) {
    return "";
  }
  return typeof payload.run_id === "string" ? payload.run_id : "";
}

function getHermesRunEventName(payload, fallbackEvent) {
  if (isRecord(payload) && typeof payload.event === "string") {
    return payload.event;
  }
  return fallbackEvent;
}

function getHermesRunDelta(payload) {
  if (!isRecord(payload)) {
    return "";
  }
  return typeof payload.delta === "string" ? payload.delta : "";
}

function getHermesRunOutput(payload) {
  if (!isRecord(payload)) {
    return "";
  }
  return typeof payload.output === "string" ? payload.output : "";
}

function getHermesToolProgress(payload, eventName) {
  if (!isRecord(payload)) {
    return { event: eventName };
  }
  const progress = { ...payload, event: eventName };
  if (typeof progress.toolName !== "string" && typeof progress.tool === "string") {
    progress.toolName = progress.tool;
  }
  return progress;
}

function readImageAttachments(providerMeta) {
  if (!isRecord(providerMeta) || !Array.isArray(providerMeta.attachments)) {
    return [];
  }

  return providerMeta.attachments.filter((attachment) => {
    return (
      isRecord(attachment) &&
      attachment.type === "image" &&
      typeof attachment.dataUrl === "string" &&
      attachment.dataUrl.startsWith("data:image/")
    );
  });
}

function toOpenAiCompatibleMessage(message) {
  const attachments = readImageAttachments(message.providerMeta);
  if (attachments.length === 0) {
    return { role: message.role, content: message.content };
  }

  const content = [];
  if (message.content.trim().length > 0) {
    content.push({ type: "text", text: message.content });
  }
  for (const attachment of attachments) {
    content.push({ type: "image_url", image_url: { url: attachment.dataUrl } });
  }
  return { role: message.role, content };
}

function loginAttemptKey(request, username) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const remoteAddress =
    typeof forwardedFor === "string" && forwardedFor.trim().length > 0
      ? forwardedFor.split(",")[0].trim()
      : request.socket.remoteAddress ?? "unknown";
  return `${remoteAddress}:${username.toLowerCase()}`;
}

function getFailedLoginRecord(key) {
  const current = failedLoginAttempts.get(key);
  if (!current || current.expiresAt <= Date.now()) {
    failedLoginAttempts.delete(key);
    return { count: 0, expiresAt: Date.now() + LOGIN_WINDOW_MS };
  }
  return current;
}

function assertLoginAllowed(request, username) {
  const key = loginAttemptKey(request, username);
  const current = getFailedLoginRecord(key);
  if (current.count >= MAX_FAILED_LOGIN_ATTEMPTS) {
    throw Object.assign(new Error("登录尝试过多，请稍后再试"), {
      status: 429,
      code: "too_many_login_attempts",
    });
  }
}

function recordFailedLogin(request, username) {
  const key = loginAttemptKey(request, username);
  const current = getFailedLoginRecord(key);
  failedLoginAttempts.set(key, {
    count: current.count + 1,
    expiresAt: current.expiresAt,
  });
}

function clearFailedLogin(request, username) {
  failedLoginAttempts.delete(loginAttemptKey(request, username));
}

function parseOpenAiAssistantContent(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw new Error("模型响应格式不正确");
  }

  const choice = payload.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) {
    throw new Error("模型响应缺少 assistant 消息");
  }

  const content = choice.message.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("模型响应内容为空");
  }
  return content;
}

function readReasoningContent(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  const choice = payload.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) {
    return null;
  }

  const candidates = [
    choice.message.reasoning_content,
    choice.message.reasoningContent,
    choice.message.reasoning,
    choice.message.thinking,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function parseOpenAiProviderMeta(payload) {
  const meta = { source: "openai-compatible" };
  if (isRecord(payload)) {
    if ("id" in payload) {
      meta.upstreamId = payload.id;
    }
    const reasoningContent = readReasoningContent(payload);
    if (reasoningContent) {
      meta.reasoningContent = reasoningContent;
    }
    if ("usage" in payload) {
      meta.usage = payload.usage;
    }
  }
  return meta;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (text.trim().length === 0) {
    return null;
  }
  return JSON.parse(text);
}

export async function createChisaTalkServer(options) {
  const databasePath = resolve(options.databasePath);
  const modelsPath = resolve(options.modelsPath);
  const SQL = await initSqlJs({ locateFile: () => SQL_WASM_PATH });
  const db = await loadDatabase(SQL, databasePath);
  const activeHermesApprovals = new Map();

  await initializeSchema(db, databasePath);

  if (options.adminUsername && options.adminPassword) {
    await ensureUser(db, databasePath, {
      username: options.adminUsername,
      password: options.adminPassword,
      displayName: options.adminDisplayName ?? options.adminUsername,
    });
  }
  if (Array.isArray(options.users)) {
    for (const user of options.users) {
      await ensureUser(db, databasePath, user);
    }
  }

  async function authenticate(request) {
    const token = getBearerToken(request);
    if (!token) {
      throw Object.assign(new Error("未登录"), { status: 401, code: "unauthorized" });
    }

    const tokenHash = hashToken(token, options.sessionSecret);
    const row = selectOne(
      db,
      `
        SELECT users.*
        FROM auth_sessions
        JOIN users ON users.id = auth_sessions.user_id
        WHERE auth_sessions.token_hash = ?
          AND auth_sessions.expires_at > ?
      `,
      [tokenHash, nowIso()],
    );

    if (!row) {
      throw Object.assign(new Error("登录已失效"), { status: 401, code: "unauthorized" });
    }

    await run(db, databasePath, "UPDATE auth_sessions SET last_active_at = ? WHERE token_hash = ?", [
      nowIso(),
      tokenHash,
    ]);
    return rowToUser(row);
  }

  async function getOwnedConversation(userId, conversationId) {
    const row = selectOne(
      db,
      "SELECT * FROM conversations WHERE id = ? AND user_id = ? AND archived = 0",
      [conversationId, userId],
    );
    if (!row) {
      throw Object.assign(new Error("会话不存在"), { status: 404, code: "not_found" });
    }
    return row;
  }

  async function handleLogin(request, response, id) {
    const body = await readJsonBody(request);
    if (!isRecord(body)) {
      throw Object.assign(new Error("请求体格式不正确"), {
        status: 422,
        code: "validation_failed",
      });
    }

    const username = requireString(body, "username");
    const password = requireString(body, "password");
    assertLoginAllowed(request, username);
    const row = selectOne(db, "SELECT * FROM users WHERE username = ?", [username]);

    if (!row || !verifyPassword(password, row.password_hash)) {
      recordFailedLogin(request, username);
      sendError(response, 401, "invalid_credentials", "账号或密码错误", id);
      return;
    }
    clearFailedLogin(request, username);

    const accessToken = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(accessToken, options.sessionSecret);
    const createdAt = nowIso();
    const expiresAt = new Date(Date.parse(createdAt) + SESSION_TTL_MS).toISOString();

    await run(
      db,
      databasePath,
      `
        INSERT INTO auth_sessions (token_hash, user_id, expires_at, last_active_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      [tokenHash, row.id, expiresAt, createdAt, createdAt],
    );

    sendJson(response, 200, { accessToken, user: rowToUser(row), expiresAt });
  }

  async function handleListConversations(request, response, user) {
    const url = new URL(request.url, "http://localhost");
    const limitText = url.searchParams.get("limit") ?? "50";
    const limitNumber = Number.parseInt(limitText, 10);
    if (!Number.isInteger(limitNumber) || limitNumber < 1 || limitNumber > 200) {
      throw Object.assign(new Error("limit 必须在 1 到 200 之间"), {
        status: 422,
        code: "validation_failed",
      });
    }

    const cursor = decodeCursor(url.searchParams.get("cursor"));
    const rows = cursor
      ? selectAll(
          db,
          `
            SELECT * FROM conversations
            WHERE user_id = ? AND archived = 0
              AND (updated_at < ? OR (updated_at = ? AND id < ?))
            ORDER BY updated_at DESC, id DESC
            LIMIT ?
          `,
          [user.id, cursor.updatedAt, cursor.updatedAt, cursor.id, limitNumber + 1],
        )
      : selectAll(
          db,
          `
            SELECT * FROM conversations
            WHERE user_id = ? AND archived = 0
            ORDER BY updated_at DESC, id DESC
            LIMIT ?
          `,
          [user.id, limitNumber + 1],
        );

    const visibleRows = rows.slice(0, limitNumber).map(rowToConversation);
    const nextCursor = rows.length > limitNumber ? encodeCursor(visibleRows[visibleRows.length - 1]) : null;
    sendJson(response, 200, { items: visibleRows, nextCursor });
  }

  async function handleCreateConversation(request, response, user) {
    const body = await readJsonBody(request);
    if (!isRecord(body)) {
      throw Object.assign(new Error("请求体格式不正确"), {
        status: 422,
        code: "validation_failed",
      });
    }

    const title = requireString(body, "title");
    const modelId = requireString(body, "modelId");
    await assertModelExists(modelsPath, modelId);

    const createdAt = nowIso();
    const conversationId = randomUUID();
    await run(
      db,
      databasePath,
      `
        INSERT INTO conversations (id, user_id, title, model_id, archived, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `,
      [conversationId, user.id, title, modelId, createdAt, createdAt],
    );

    const row = selectOne(db, "SELECT * FROM conversations WHERE id = ?", [conversationId]);
    sendJson(response, 201, { conversation: rowToConversation(row) });
  }

  async function handleGetConversation(response, user, conversationId) {
    const conversation = await getOwnedConversation(user.id, conversationId);
    const messages = selectAll(
      db,
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC",
      [conversationId],
    );
    sendJson(response, 200, {
      conversation: rowToConversation(conversation),
      messages: messages.map(rowToMessage),
    });
  }

  async function handleCreateMessage(request, response, user, conversationId) {
    await getOwnedConversation(user.id, conversationId);
    const body = await readJsonBody(request);
    if (!isRecord(body)) {
      throw Object.assign(new Error("请求体格式不正确"), {
        status: 422,
        code: "validation_failed",
      });
    }

    const role = requireString(body, "role");
    if (role !== "system" && role !== "user" && role !== "assistant") {
      throw Object.assign(new Error("role 格式不正确"), {
        status: 422,
        code: "validation_failed",
      });
    }
    const content = requireString(body, "content");
    const modelId = requireString(body, "modelId");
    const clientMessageId = optionalString(body, "clientMessageId");
    const providerMeta = normalizeProviderMeta(body.providerMeta);
    await assertModelExists(modelsPath, modelId);

    const result = await insertMessage(db, databasePath, conversationId, {
      role,
      content,
      modelId,
      clientMessageId,
      providerMeta,
    });
    sendJson(response, 201, {
      message: result.message,
      conversation: result.conversation,
    });
  }

  async function handleCreateChatCompletion(request, response, user, conversationId, id) {
    await getOwnedConversation(user.id, conversationId);
    const body = await readJsonBody(request);
    if (!isRecord(body)) {
      throw Object.assign(new Error("请求体格式不正确"), {
        status: 422,
        code: "validation_failed",
      });
    }

    const modelId = requireString(body, "modelId");
    const model = await getModelConfig(modelsPath, modelId);
    if (model.providerType !== "openai-compatible") {
      throw Object.assign(new Error("当前模型不是 OpenAI-compatible 模型"), {
        status: 422,
        code: "validation_failed",
      });
    }
    if (typeof model.chatCompletionsUrl !== "string" || typeof model.apiKey !== "string") {
      throw Object.assign(new Error("模型代理配置不完整"), {
        status: 500,
        code: "model_proxy_not_configured",
      });
    }

    const contentValue = body.content;
    const content = typeof contentValue === "string" ? contentValue.trim() : "";
    const providerMeta = normalizeProviderMeta(body.providerMeta);
    if (content.length === 0 && readImageAttachments(providerMeta).length === 0) {
      throw Object.assign(new Error("content 必须是非空字符串"), {
        status: 422,
        code: "validation_failed",
      });
    }

    const clientMessageId = optionalString(body, "clientMessageId");
    const editMessageId = optionalString(body, "editMessageId");
    const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";
    const editedUserResult = editMessageId
      ? await updateUserMessageForRegeneration(db, databasePath, conversationId, {
          messageId: editMessageId,
          content,
          modelId,
          clientMessageId,
        })
      : null;
    const historyRows = selectAll(
      db,
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC",
      [conversationId],
    );
    const newUserMessage = {
      role: "user",
      content,
      providerMeta,
    };
    const messages = [
      systemPrompt ? { role: "system", content: systemPrompt } : null,
      ...historyRows.map(rowToMessage).map(toOpenAiCompatibleMessage),
      editMessageId ? null : toOpenAiCompatibleMessage(newUserMessage),
    ].filter(Boolean);

    const upstreamResponse = await fetch(model.chatCompletionsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${model.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: typeof model.model === "string" ? model.model : modelId,
        messages,
        ...(isRecord(model.defaultParameters) ? model.defaultParameters : {}),
      }),
    });
    const payload = await readJsonResponse(upstreamResponse);

    if (!upstreamResponse.ok) {
      sendError(response, 502, "provider_request_failed", "模型调用失败", id);
      return;
    }

    const assistantContent = parseOpenAiAssistantContent(payload);
    const userResult =
      editedUserResult ??
      (await insertMessage(db, databasePath, conversationId, {
        role: "user",
        content,
        modelId,
        clientMessageId,
        providerMeta,
      }));
    const assistantResult = await insertMessage(db, databasePath, conversationId, {
      role: "assistant",
      content: assistantContent,
      modelId,
      clientMessageId: `server_${randomUUID()}`,
      providerMeta: parseOpenAiProviderMeta(payload),
    });

    sendJson(response, 200, {
      userMessage: userResult.message,
      assistantMessage: assistantResult.message,
      conversation: assistantResult.conversation,
    });
  }

  function rememberHermesApproval(conversationId, approval) {
    activeHermesApprovals.set(conversationId, {
      ...approval,
      createdAt: Date.now(),
    });
  }

  function clearHermesApproval(conversationId, runId) {
    const current = activeHermesApprovals.get(conversationId);
    if (!current || !runId || current.runId === runId) {
      activeHermesApprovals.delete(conversationId);
    }
  }

  function findPendingHermesApproval(conversationId) {
    const active = activeHermesApprovals.get(conversationId);
    if (active && Date.now() - active.createdAt < 30 * 60 * 1000) {
      return active;
    }

    const rows = selectAll(
      db,
      `
        SELECT * FROM messages
        WHERE conversation_id = ? AND role = 'assistant'
        ORDER BY created_at DESC, id DESC
        LIMIT 20
      `,
      [conversationId],
    );
    for (const row of rows) {
      const message = rowToMessage(row);
      if (!isRecord(message.providerMeta) || message.providerMeta.source !== "hermes-agent") {
        continue;
      }
      const pendingApproval = message.providerMeta.pendingApproval;
      if (!isRecord(pendingApproval) || typeof pendingApproval.runId !== "string") {
        continue;
      }
      return {
        runId: pendingApproval.runId,
        event: pendingApproval.event ?? null,
      };
    }
    return null;
  }

  async function resolveHermesApproval(approval, command) {
    const upstreamResponse = await fetch(
      `${getHermesApiBaseUrl(options)}/runs/${encodeURIComponent(approval.runId)}/approval`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.hermesApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ choice: command.choice }),
      },
    );
    if (!upstreamResponse.ok) {
      throw Object.assign(new Error("Hermes Agent 审批失败"), {
        status: 502,
        code: "hermes_approval_failed",
      });
    }
    return readJsonResponse(upstreamResponse);
  }

  async function stopHermesRun(runId) {
    try {
      await fetch(`${getHermesApiBaseUrl(options)}/runs/${encodeURIComponent(runId)}/stop`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.hermesApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "client_disconnected" }),
      });
    } catch (error) {
      console.error("[ChisaTalkServer] Hermes stop failed", error);
    }
  }

  async function streamApprovedHermesRunContinuation(response, { user, conversationId, modelId, runId, requestId, signal }) {
    const upstreamResponse = await fetch(`${getHermesApiBaseUrl(options)}/runs/${encodeURIComponent(runId)}/events`, {
      method: "GET",
      signal,
      headers: {
        Authorization: `Bearer ${options.hermesApiKey}`,
        "X-Hermes-Session-Key": `chisatalk-user-${user.id}`,
      },
    });

    if (!upstreamResponse.ok) {
      writeSse(response, "error", {
        code: "hermes_events_failed",
        message: "Hermes Agent 事件流调用失败",
        requestId,
      });
      response.end();
      return;
    }

    let assistantContent = "";
    const toolProgress = [];
    let completed = false;

    for await (const upstreamEvent of readSseEvents(upstreamResponse.body)) {
      if (upstreamEvent.data === "[DONE]") {
        break;
      }

      let payload;
      try {
        payload = JSON.parse(upstreamEvent.data);
      } catch (error) {
        console.error("[ChisaTalkServer] Hermes SSE parse failed", error);
        continue;
      }

      const eventName = getHermesRunEventName(payload, upstreamEvent.event);
      if (eventName === "approval.responded") {
        clearHermesApproval(conversationId, runId);
        const progress = getHermesToolProgress(payload, eventName);
        toolProgress.push(progress);
        writeSse(response, "tool_progress", progress);
        continue;
      }

      if (eventName.startsWith("tool.") || eventName === "hermes.tool.progress") {
        const progress = getHermesToolProgress(payload, eventName);
        toolProgress.push(progress);
        writeSse(response, "tool_progress", progress);
        continue;
      }

      if (eventName === "run.completed") {
        completed = true;
        clearHermesApproval(conversationId, runId);
        if (assistantContent.length === 0) {
          const output = getHermesRunOutput(payload);
          if (output.length > 0) {
            assistantContent = output;
            writeSse(response, "assistant_delta", { delta: output });
          }
        }
        continue;
      }

      if (eventName === "run.failed" || eventName === "run.cancelled") {
        writeSse(response, "error", {
          code: eventName === "run.cancelled" ? "hermes_run_cancelled" : "hermes_run_failed",
          message:
            isRecord(payload) && typeof payload.error === "string"
              ? payload.error
              : "Hermes Agent 执行失败",
          requestId,
        });
        response.end();
        return;
      }

      const delta = eventName === "message.delta" ? getHermesRunDelta(payload) : getAssistantDelta(payload);
      if (delta.length > 0) {
        assistantContent += delta;
        writeSse(response, "assistant_delta", { delta });
      }
    }

    if (assistantContent.length === 0) {
      writeSse(response, "error", {
        code: "empty_hermes_response",
        message: completed ? "Hermes Agent 没有返回内容" : "Hermes Agent 审批后没有返回内容",
        requestId,
      });
      response.end();
      return;
    }

    const assistantResult = await insertMessage(db, databasePath, conversationId, {
      role: "assistant",
      content: assistantContent,
      modelId,
      clientMessageId: `server_${randomUUID()}`,
      providerMeta: {
        source: "hermes-agent",
        hermesRunId: runId,
        toolProgress,
      },
    });
    writeSse(response, "assistant_message", {
      message: assistantResult.message,
      conversation: assistantResult.conversation,
    });
    writeSse(response, "done", { ok: true });
    response.end();
  }

  async function handleAgentTurnStream(request, response, user, conversationId, id) {
    await getOwnedConversation(user.id, conversationId);
    const body = await readJsonBody(request);
    if (!isRecord(body)) {
      throw Object.assign(new Error("请求体格式不正确"), {
        status: 422,
        code: "validation_failed",
      });
    }

    const modelId = requireString(body, "modelId");
    const model = await getModelConfig(modelsPath, modelId);
    if (model.providerType !== "hermes-agent") {
      throw Object.assign(new Error("当前模型不是 Hermes Agent"), {
        status: 422,
        code: "validation_failed",
      });
    }
    if (!options.hermesApiKey) {
      throw Object.assign(new Error("缺少 CHISATALK_HERMES_API_KEY"), {
        status: 500,
        code: "hermes_not_configured",
      });
    }

    const contentValue = body.content;
    const content = typeof contentValue === "string" ? contentValue.trim() : "";
    const providerMeta = normalizeProviderMeta(body.providerMeta);
    if (content.length === 0 && readImageAttachments(providerMeta).length === 0) {
      throw Object.assign(new Error("content 必须是非空字符串"), {
        status: 422,
        code: "validation_failed",
      });
    }
    const clientMessageId = optionalString(body, "clientMessageId");
    const editMessageId = optionalString(body, "editMessageId");
    const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";

    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });

    try {
      const userResult = editMessageId
        ? await updateUserMessageForRegeneration(db, databasePath, conversationId, {
            messageId: editMessageId,
            content,
            modelId,
            clientMessageId,
          })
        : await insertMessage(db, databasePath, conversationId, {
            role: "user",
            content,
            modelId,
            clientMessageId,
            providerMeta,
          });
      writeSse(response, "user_message", {
        message: userResult.message,
        conversation: userResult.conversation,
      });

      const approvalCommand = normalizeApprovalCommand(content);
      if (approvalCommand) {
        const approval = findPendingHermesApproval(conversationId);
        if (!approval) {
          const assistantResult = await insertMessage(db, databasePath, conversationId, {
            role: "assistant",
            content: "没有找到正在等待安全审核的 Hermes 命令，可能已经处理或过期。",
            modelId,
            clientMessageId: `server_${randomUUID()}`,
            providerMeta: { source: "hermes-agent", approvalResponse: { resolved: 0 } },
          });
          writeSse(response, "assistant_message", {
            message: assistantResult.message,
            conversation: assistantResult.conversation,
          });
          writeSse(response, "done", { ok: true });
          response.end();
          return;
        }

        const approvalPayload = await resolveHermesApproval(approval, approvalCommand);
        clearHermesApproval(conversationId, approval.runId);
        writeSse(response, "approval_response", {
          runId: approval.runId,
          choice: approvalCommand.choice,
          payload: approvalPayload,
        });
        const approvalEventsAbortController = new AbortController();
        let approvalContinuationEnded = false;
        const abortApprovalEvents = () => {
          if (!approvalContinuationEnded) {
            approvalEventsAbortController.abort();
            void stopHermesRun(approval.runId);
          }
        };
        request.once("close", abortApprovalEvents);
        response.once("close", abortApprovalEvents);
        try {
          await streamApprovedHermesRunContinuation(response, {
            user,
            conversationId,
            modelId,
            runId: approval.runId,
            requestId: id,
            signal: approvalEventsAbortController.signal,
          });
        } finally {
          approvalContinuationEnded = true;
          request.off("close", abortApprovalEvents);
          response.off("close", abortApprovalEvents);
        }
        return;
      }

      const messageRows = selectAll(
        db,
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC",
        [conversationId],
      );
      const messageObjects = messageRows.map(rowToMessage);
      const historyMessages = messageObjects
        .filter((message) => message.id !== userResult.message.id)
        .map(toOpenAiCompatibleMessage);
      const hermesPreset = await readHermesPreset(options);
      const githubLookupMessage = await buildGitHubLookupSystemMessage(content, options);
      const hermesSystemMessages = [
        hermesPreset ? { role: "system", content: hermesPreset } : null,
        systemPrompt ? { role: "system", content: systemPrompt } : null,
        githubLookupMessage ? { role: "system", content: githubLookupMessage } : null,
        { role: "system", content: HERMES_SEARCH_CONSENT_PROMPT },
      ].filter(Boolean);
      const hermesInstructions = buildHermesInstructions(hermesSystemMessages);

      const upstreamAbortController = new AbortController();
      let responseEnded = false;
      let activeHermesRunId = "";
      const abortActiveRun = () => {
        if (!responseEnded) {
          upstreamAbortController.abort();
          if (activeHermesRunId) {
            void stopHermesRun(activeHermesRunId);
          }
        }
      };
      request.on("close", abortActiveRun);
      response.on("close", abortActiveRun);
      const startResponse = await fetch(`${getHermesApiBaseUrl(options)}/runs`, {
        method: "POST",
        signal: upstreamAbortController.signal,
        headers: {
          Authorization: `Bearer ${options.hermesApiKey}`,
          "Content-Type": "application/json",
          "X-Hermes-Session-Key": `chisatalk-user-${user.id}`,
        },
        body: JSON.stringify({
          model: typeof model.model === "string" ? model.model : modelId,
          input: content,
          conversation_history: toHermesRunHistory(historyMessages),
          instructions: hermesInstructions,
          session_id: `chisatalk-conversation-${conversationId}`,
          ...(isRecord(model.defaultParameters) ? model.defaultParameters : {}),
        }),
      });

      if (!startResponse.ok) {
        writeSse(response, "error", {
          code: "hermes_request_failed",
          message: "Hermes Agent 调用失败",
          requestId: id,
        });
        response.end();
        return;
      }

      const startPayload = await readJsonResponse(startResponse);
      const runId = getHermesRunId(startPayload);
      if (!runId) {
        writeSse(response, "error", {
          code: "hermes_run_start_failed",
          message: "Hermes Agent 没有返回 run_id",
          requestId: id,
        });
        response.end();
        return;
      }
      activeHermesRunId = runId;

      const upstreamResponse = await fetch(`${getHermesApiBaseUrl(options)}/runs/${encodeURIComponent(runId)}/events`, {
        method: "GET",
        signal: upstreamAbortController.signal,
        headers: {
          Authorization: `Bearer ${options.hermesApiKey}`,
          "X-Hermes-Session-Key": `chisatalk-user-${user.id}`,
        },
      });

      if (!upstreamResponse.ok) {
        writeSse(response, "error", {
          code: "hermes_events_failed",
          message: "Hermes Agent 事件流调用失败",
          requestId: id,
        });
        response.end();
        return;
      }

      let assistantContent = "";
      const toolProgress = [];
      let pendingApproval = null;
      let completed = false;

      for await (const upstreamEvent of readSseEvents(upstreamResponse.body)) {
        if (upstreamEvent.data === "[DONE]") {
          break;
        }

        let payload;
        try {
          payload = JSON.parse(upstreamEvent.data);
        } catch (error) {
          console.error("[ChisaTalkServer] Hermes SSE parse failed", error);
          continue;
        }

        const eventName = getHermesRunEventName(payload, upstreamEvent.event);
        if (eventName === "approval.request") {
          pendingApproval = {
            runId,
            event: payload,
          };
          rememberHermesApproval(conversationId, pendingApproval);
          const progress = getHermesToolProgress(payload, eventName);
          toolProgress.push(progress);
          writeSse(response, "tool_progress", progress);
          continue;
        }

        if (eventName === "approval.responded") {
          clearHermesApproval(conversationId, runId);
          const progress = getHermesToolProgress(payload, eventName);
          toolProgress.push(progress);
          writeSse(response, "tool_progress", progress);
          continue;
        }

        if (eventName.startsWith("tool.") || eventName === "hermes.tool.progress") {
          const progress = getHermesToolProgress(payload, eventName);
          toolProgress.push(progress);
          writeSse(response, "tool_progress", progress);
          continue;
        }

        if (eventName === "run.completed") {
          completed = true;
          clearHermesApproval(conversationId, runId);
          if (assistantContent.length === 0) {
            const output = getHermesRunOutput(payload);
            if (output.length > 0) {
              assistantContent = output;
              writeSse(response, "assistant_delta", { delta: output });
            }
          }
          continue;
        }

        if (eventName === "run.failed" || eventName === "run.cancelled") {
          writeSse(response, "error", {
            code: eventName === "run.cancelled" ? "hermes_run_cancelled" : "hermes_run_failed",
            message:
              isRecord(payload) && typeof payload.error === "string"
                ? payload.error
                : "Hermes Agent 执行失败",
            requestId: id,
          });
          response.end();
          return;
        }

        const delta = eventName === "message.delta" ? getHermesRunDelta(payload) : getAssistantDelta(payload);
        if (delta.length > 0) {
          assistantContent += delta;
          writeSse(response, "assistant_delta", { delta });
        }
      }

      if (assistantContent.length === 0) {
        if (pendingApproval) {
          assistantContent = "命令正在等待安全审核通过。你可以发送“批准”或“拒绝”来处理。";
          writeSse(response, "assistant_delta", { delta: assistantContent });
        } else {
          writeSse(response, "error", {
            code: "empty_hermes_response",
            message: "Hermes Agent 没有返回内容",
            requestId: id,
          });
          response.end();
          return;
        }
      }

      const assistantResult = await insertMessage(db, databasePath, conversationId, {
        role: "assistant",
        content: assistantContent,
        modelId,
        clientMessageId: `server_${randomUUID()}`,
        providerMeta: {
          source: "hermes-agent",
          hermesRunId: runId,
          ...(pendingApproval && !completed
            ? {
                pendingApproval: {
                  runId,
                  event: pendingApproval.event,
                },
              }
            : {}),
          toolProgress,
        },
      });
      writeSse(response, "assistant_message", {
        message: assistantResult.message,
        conversation: assistantResult.conversation,
      });
      writeSse(response, "done", { ok: true });
      responseEnded = true;
      response.end();
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
      console.error("[ChisaTalkServer] Hermes stream failed", error);
      writeSse(response, "error", {
        code: typeof error.code === "string" ? error.code : "hermes_stream_failed",
        message: error instanceof Error ? error.message : "Hermes Agent 调用失败",
        requestId: id,
      });
      response.end();
    }
  }

  async function handlePatchConversation(request, response, user, conversationId) {
    await getOwnedConversation(user.id, conversationId);
    const body = await readJsonBody(request);
    if (!isRecord(body)) {
      throw Object.assign(new Error("请求体格式不正确"), {
        status: 422,
        code: "validation_failed",
      });
    }

    const title = optionalString(body, "title");
    const modelId = optionalString(body, "modelId");
    const archived = optionalBoolean(body, "archived");

    if (modelId) {
      await assertModelExists(modelsPath, modelId);
    }

    const updates = ["updated_at = ?"];
    const params = [nowIso()];
    if (title) {
      updates.push("title = ?");
      params.push(title);
    }
    if (modelId) {
      updates.push("model_id = ?");
      params.push(modelId);
    }
    if (archived !== undefined) {
      updates.push("archived = ?");
      params.push(archived ? 1 : 0);
    }
    params.push(conversationId);

    await run(db, databasePath, `UPDATE conversations SET ${updates.join(", ")} WHERE id = ?`, params);
    const row = selectOne(db, "SELECT * FROM conversations WHERE id = ?", [conversationId]);
    sendJson(response, 200, { conversation: rowToConversation(row) });
  }

  const server = createServer(async (request, response) => {
    const id = requestId();
    const url = new URL(request.url, "http://localhost");

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { ok: true, service: "chisatalk-server" });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/auth/login") {
        await handleLogin(request, response, id);
        return;
      }

      const user = await authenticate(request);

      if (request.method === "GET" && url.pathname === "/v1/auth/me") {
        sendJson(response, 200, { user });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/models") {
        sendJson(response, 200, await loadVisibleModels(modelsPath));
        return;
      }

      if (url.pathname === "/v1/conversations") {
        if (request.method === "GET") {
          await handleListConversations(request, response, user);
          return;
        }
        if (request.method === "POST") {
          await handleCreateConversation(request, response, user);
          return;
        }
      }

      const conversationMatch = url.pathname.match(/^\/v1\/conversations\/([^/]+)$/);
      if (conversationMatch) {
        const conversationId = decodeURIComponent(conversationMatch[1]);
        if (request.method === "GET") {
          await handleGetConversation(response, user, conversationId);
          return;
        }
        if (request.method === "PATCH") {
          await handlePatchConversation(request, response, user, conversationId);
          return;
        }
      }

      const messageMatch = url.pathname.match(/^\/v1\/conversations\/([^/]+)\/messages$/);
      if (messageMatch && request.method === "POST") {
        await handleCreateMessage(request, response, user, decodeURIComponent(messageMatch[1]));
        return;
      }

      const chatCompletionMatch = url.pathname.match(/^\/v1\/conversations\/([^/]+)\/chat-completions$/);
      if (chatCompletionMatch && request.method === "POST") {
        await handleCreateChatCompletion(request, response, user, decodeURIComponent(chatCompletionMatch[1]), id);
        return;
      }

      const agentTurnMatch = url.pathname.match(/^\/v1\/conversations\/([^/]+)\/agent-turns\/stream$/);
      if (agentTurnMatch && request.method === "POST") {
        await handleAgentTurnStream(request, response, user, decodeURIComponent(agentTurnMatch[1]), id);
        return;
      }

      sendError(response, 404, "not_found", "接口不存在", id);
    } catch (error) {
      console.error("[ChisaTalkServer] Request failed", error);
      const status = Number.isInteger(error.status) ? error.status : 500;
      const code = typeof error.code === "string" ? error.code : "internal_error";
      const message = error instanceof Error ? error.message : "服务器内部错误";
      sendError(response, status, code, message, id);
    }
  });

  server.closeDatabase = async () => {
    await persistDatabase(db, databasePath);
    db.close();
  };

  return server;
}

export { readRuntimeConfig };

const executedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === executedPath) {
  const port = Number.parseInt(process.env.PORT ?? "8789", 10);
  const app = await createChisaTalkServer(readRuntimeConfig());
  app.listen(port, "0.0.0.0", () => {
    console.log(`ChisaTalk server listening on ${port}`);
  });
}
