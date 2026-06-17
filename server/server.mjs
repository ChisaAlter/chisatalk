import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, ".env"));

const HOST = requireEnv("CHISATALK_HOST");
const PORT = parseInteger(requireEnv("CHISATALK_PORT"), "CHISATALK_PORT");
const JWT_SECRET = requireEnv("CHISATALK_JWT_SECRET");
const TOKEN_TTL_SECONDS = parseInteger(
  requireEnv("CHISATALK_TOKEN_TTL_SECONDS"),
  "CHISATALK_TOKEN_TTL_SECONDS"
);
const USERS = readUsers();
const revokedTokens = new Map();

const BASIC_ALLOWED_TOOLS = new Set([
  "web_search",
  "web_visit",
  "attachment_read",
  "memory_query",
  "calculator",
  "visit_web",
  "read_file",
  "read_file_part",
  "read_file_full",
  "query_memory",
  "calculate"
]);

const server = createServer(async (req, res) => {
  try {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      sendNoContent(res);
      return;
    }

    if (!req.url) {
      throw httpError(400, "invalid_request", "缺少请求 URL");
    }
    if (typeof req.headers.host !== "string") {
      throw httpError(400, "invalid_request", "缺少 Host 请求头");
    }
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true, service: "chisatalk-server" });
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/auth/login") {
      await handleLogin(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/auth/me") {
      const session = authenticate(req);
      sendJson(res, 200, { user: session.user });
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/auth/logout") {
      const session = authenticate(req);
      revokedTokens.set(session.token, session.exp);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/models") {
      authenticate(req);
      const models = readModelConfig().models
        .filter((model) => model.enabled === true)
        .map((model) => ({
          id: model.id,
          displayName: model.displayName,
          description: requireString(model.description, "model.description"),
          capabilities: requireArray(model.capabilities, "model.capabilities"),
          enabled: model.enabled
        }));
      sendJson(res, 200, { models });
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/chat/stream") {
      authenticate(req);
      await handleChatStream(req, res);
      return;
    }

    sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    handleError(res, error);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ChisaTalk server listening on ${HOST}:${PORT}`);
});

async function handleLogin(req, res) {
  const body = await readJsonBody(req);
  const username = requireString(body.username, "username");
  const password = requireString(body.password, "password");
  const record = USERS.find((user) => user.username === username);

  if (!record || !safeEqual(record.password, password)) {
    throw httpError(401, "invalid_credentials", "用户名或密码错误");
  }

  const user = {
    id: record.id,
    username: record.username,
    displayName: record.displayName
  };
  const accessToken = signToken(user);
  sendJson(res, 200, { accessToken, user });
}

async function handleChatStream(req, res) {
  const body = await readJsonBody(req);
  const modelId = requireString(body.modelId, "modelId");
  const messages = requireArray(body.messages, "messages").map(normalizeMessage);
  const allowedTools = body.toolContext?.allowedTools;
  if (allowedTools !== undefined) {
    requireArray(allowedTools, "toolContext.allowedTools").forEach((tool) => {
      if (!BASIC_ALLOWED_TOOLS.has(tool)) {
        throw httpError(400, "tool_not_allowed", `Tool is not allowed: ${tool}`);
      }
    });
  }

  const model = readModelConfig().models.find((item) => item.id === modelId && item.enabled === true);
  if (!model) {
    throw httpError(404, "model_not_found", "模型不存在或未启用");
  }
  if (!model.provider || model.provider.type !== "openai-compatible") {
    throw httpError(500, "provider_not_supported", "模型 provider 未配置为 openai-compatible");
  }

  await streamOpenAICompatible(res, model, messages);
}

async function streamOpenAICompatible(res, model, messages) {
  const provider = model.provider;
  const chatCompletionsUrl = requireString(provider.chatCompletionsUrl, "provider.chatCompletionsUrl");
  const upstreamModel = requireString(provider.model, "provider.model");
  const apiKey = requireEnv(requireString(provider.apiKeyEnv, "provider.apiKeyEnv"));
  const payload = {
    model: upstreamModel,
    messages,
    stream: true
  };

  const upstream = await fetch(chatCompletionsUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Accept": "text/event-stream"
    },
    body: JSON.stringify(payload)
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    throw httpError(upstream.status, "upstream_error", text);
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });

  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of upstream.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    const rest = lines.pop();
    if (rest === undefined) {
      throw httpError(500, "stream_parse_error", "上游流解析失败");
    }
    buffer = rest;
    for (const line of lines) {
      if (!line.startsWith("data:")) {
        continue;
      }
      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        writeSse(res, { type: "done" });
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
      const event = JSON.parse(data);
      const content = event.choices?.[0]?.delta?.content;
      if (typeof content === "string" && content.length > 0) {
        writeSse(res, { type: "delta", content });
      }
      if (
        event.usage &&
        Number.isInteger(event.usage.prompt_tokens) &&
        Number.isInteger(event.usage.completion_tokens)
      ) {
        writeSse(res, {
          type: "usage",
          inputTokens: event.usage.prompt_tokens,
          outputTokens: event.usage.completion_tokens
        });
      }
    }
  }

  writeSse(res, { type: "done" });
  res.write("data: [DONE]\n\n");
  res.end();
}

function authenticate(req) {
  const auth = req.headers.authorization;
  if (typeof auth !== "string") {
    throw httpError(401, "missing_token", "缺少登录令牌");
  }
  const match = auth.match(/^Bearer (.+)$/);
  if (!match) {
    throw httpError(401, "missing_token", "缺少登录令牌");
  }
  const token = match[1];
  const session = verifyToken(token);
  const revokedExp = revokedTokens.get(token);
  if (revokedExp && revokedExp > Math.floor(Date.now() / 1000)) {
    throw httpError(401, "revoked_token", "登录令牌已退出");
  }
  return { ...session, token };
}

function signToken(user) {
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlJson({
    sub: user.id,
    user,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    jti: randomUUID()
  });
  const signature = sign(`${header}.${payload}`);
  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw httpError(401, "invalid_token", "登录令牌无效");
  }
  const [header, payload, signature] = parts;
  if (!safeEqual(sign(`${header}.${payload}`), signature)) {
    throw httpError(401, "invalid_token", "登录令牌无效");
  }
  const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!session.exp || session.exp <= Math.floor(Date.now() / 1000)) {
    throw httpError(401, "expired_token", "登录令牌已过期");
  }
  return session;
}

function readUsers() {
  const users = JSON.parse(requireEnv("CHISATALK_USERS_JSON"));
  if (!Array.isArray(users) || users.length === 0) {
    throw new Error("CHISATALK_USERS_JSON must contain at least one user");
  }
  return users.map((user) => ({
    id: requireString(user.id, "user.id"),
    username: requireString(user.username, "user.username"),
    password: requireString(user.password, "user.password"),
    displayName: requireString(user.displayName, "user.displayName")
  }));
}

function readModelConfig() {
  const filePath = requireEnv("CHISATALK_MODELS_FILE");
  if (!existsSync(filePath)) {
    throw httpError(500, "missing_models_config", "模型配置文件不存在");
  }
  const config = JSON.parse(readFileSync(filePath, "utf8"));
  if (!Array.isArray(config.models)) {
    throw httpError(500, "invalid_models_config", "模型配置格式错误");
  }
  return config;
}

function normalizeMessage(message) {
  const role = requireString(message.role, "message.role");
  const content = requireString(message.content, "message.content");
  if (!["system", "user", "assistant", "tool"].includes(role)) {
    throw httpError(400, "invalid_role", `Invalid role: ${role}`);
  }
  return { role, content };
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 1024 * 1024) {
      throw httpError(413, "body_too_large", "请求体过大");
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw httpError(400, "invalid_json", "请求体不是有效 JSON");
  }
}

function writeSse(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function sendNoContent(res) {
  res.writeHead(204);
  res.end();
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function handleError(res, error) {
  const statusCode = error.statusCode || 500;
  const code = error.code || "internal_error";
  const message = error.publicMessage || "服务器内部错误";
  if (statusCode >= 500) {
    console.error(error);
  }
  if (!res.headersSent) {
    sendJson(res, statusCode, { error: code, message });
    return;
  }
  writeSse(res, { type: "error", message });
  res.end();
}

function httpError(statusCode, code, publicMessage) {
  const error = new Error(publicMessage);
  error.statusCode = statusCode;
  error.code = code;
  error.publicMessage = publicMessage;
  return error;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }
  return parsed;
}

function requireString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw httpError(400, "invalid_request", `${name} must be a non-empty string`);
  }
  return value;
}

function requireArray(value, name) {
  if (!Array.isArray(value)) {
    throw httpError(400, "invalid_request", `${name} must be an array`);
  }
  return value;
}

function sign(value) {
  return createHmac("sha256", JWT_SECRET).update(value).digest("base64url");
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function loadEnv(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
