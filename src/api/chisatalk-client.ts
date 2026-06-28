import { CHISATALK_API_BASE_URL } from "./api-base-url";

export { CHISATALK_API_BASE_URL };

export interface ChisaTalkUser {
  id: string;
  username: string;
  displayName: string;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

interface ChisaTalkModelBase {
  id: string;
  label: string;
  provider: string;
  model: string;
  enabled: boolean;
  supportsStreaming: boolean;
  defaultParameters?: { [key: string]: JsonValue };
  description?: string;
}

export interface OpenAiCompatibleChisaTalkModel extends ChisaTalkModelBase {
  providerType: "openai-compatible";
}

export interface HermesAgentChisaTalkModel extends ChisaTalkModelBase {
  providerType: "hermes-agent";
}

export type ChisaTalkModel = OpenAiCompatibleChisaTalkModel | HermesAgentChisaTalkModel;

export interface ChisaTalkConversation {
  id: string;
  title: string;
  userId: string;
  modelId: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ChisaTalkMessageRole = "system" | "user" | "assistant";

export interface ChisaTalkMessage {
  id: string;
  conversationId: string;
  role: ChisaTalkMessageRole;
  content: string;
  modelId: string | null;
  clientMessageId: string | null;
  providerMeta: JsonValue | null;
  createdAt: string;
}

export interface ChisaTalkImageAttachment {
  [key: string]: JsonValue;
  type: "image";
  mimeType: string;
  dataUrl: string;
  width: number | null;
  height: number | null;
  name: string | null;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  user: ChisaTalkUser;
  expiresAt?: string;
}

export type ChisaTalkFetch = typeof fetch;

export class ChisaTalkApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(input: { status: number; code: string; message: string }) {
    super(input.message);
    this.name = "ChisaTalkApiError";
    this.status = input.status;
    this.code = input.code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function parseJsonValue(value: unknown): JsonValue {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(parseJsonValue);
  }

  if (isRecord(value)) {
    const parsed: { [key: string]: JsonValue } = {};
    for (const [key, childValue] of Object.entries(value)) {
      parsed[key] = parseJsonValue(childValue);
    }
    return parsed;
  }

  throw new Error("JSON 字段格式不正确");
}

function readJsonValue(record: Record<string, unknown>, key: string): JsonValue | undefined {
  if (!(key in record)) {
    return undefined;
  }
  return parseJsonValue(record[key]);
}

function readNullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  throw new Error(`${key} 字段格式不正确`);
}

function parseUser(value: unknown): ChisaTalkUser {
  if (!isRecord(value)) {
    throw new Error("用户信息格式不正确");
  }

  const id = readString(value, "id");
  const username = readString(value, "username");
  const displayName = readString(value, "displayName");

  if (!id || !username || !displayName) {
    throw new Error("用户信息缺少必要字段");
  }

  return { id, username, displayName };
}

function parseModel(value: unknown): ChisaTalkModel {
  if (!isRecord(value)) {
    throw new Error("模型信息格式不正确");
  }

  const id = readString(value, "id");
  const label = readString(value, "label");
  const provider = readString(value, "provider");
  const providerType = readString(value, "providerType");
  const model = readString(value, "model");
  const enabled = readBoolean(value, "enabled");
  const supportsStreaming = readBoolean(value, "supportsStreaming");
  const description = readString(value, "description");
  const defaultParametersValue = readJsonValue(value, "defaultParameters");

  if (!id || !label || !provider || !model || enabled === undefined || supportsStreaming === undefined) {
    throw new Error("模型信息缺少必要字段");
  }

  if (providerType !== "openai-compatible" && providerType !== "hermes-agent") {
    throw new Error("模型信息缺少必要字段");
  }

  const parsedBase = {
    id,
    label,
    provider,
    providerType,
    model,
    enabled,
    supportsStreaming,
  };

  const parsed: ChisaTalkModel =
    providerType === "openai-compatible"
      ? {
          ...parsedBase,
          providerType,
        }
      : {
          ...parsedBase,
          providerType,
        };

  if (description) {
    parsed.description = description;
  }
  if (defaultParametersValue !== undefined) {
    if (!isRecord(defaultParametersValue)) {
      throw new Error("模型默认参数格式不正确");
    }
    parsed.defaultParameters = defaultParametersValue;
  }

  return parsed;
}

function parseConversation(value: unknown): ChisaTalkConversation {
  if (!isRecord(value)) {
    throw new Error("会话信息格式不正确");
  }

  const id = readString(value, "id");
  const title = readString(value, "title");
  const userId = readString(value, "userId");
  const modelId = readNullableString(value, "modelId");
  const archived = readBoolean(value, "archived");
  const createdAt = readString(value, "createdAt");
  const updatedAt = readString(value, "updatedAt");

  if (!id || !title || !userId || archived === undefined || !createdAt || !updatedAt) {
    throw new Error("会话信息缺少必要字段");
  }

  return { id, title, userId, modelId, archived, createdAt, updatedAt };
}

function parseMessageRole(value: unknown): ChisaTalkMessageRole {
  if (value === "system" || value === "user" || value === "assistant") {
    return value;
  }
  throw new Error("消息角色格式不正确");
}

function parseMessage(value: unknown): ChisaTalkMessage {
  if (!isRecord(value)) {
    throw new Error("消息格式不正确");
  }

  const id = readString(value, "id");
  const conversationId = readString(value, "conversationId");
  const content = readString(value, "content");
  const modelId = readNullableString(value, "modelId");
  const clientMessageId = readNullableString(value, "clientMessageId");
  const providerMeta = readJsonValue(value, "providerMeta");
  const createdAt = readString(value, "createdAt");

  if (!id || !conversationId || content === undefined || !createdAt) {
    throw new Error("消息缺少必要字段");
  }

  return {
    id,
    conversationId,
    role: parseMessageRole(value.role),
    content,
    modelId,
    clientMessageId,
    providerMeta: providerMeta === undefined ? null : providerMeta,
    createdAt,
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    console.error("[ChisaTalkApi] JSON parse failed", error);
    throw new Error("服务器响应不是有效 JSON");
  }
}

function getErrorMessage(payload: unknown): { code: string; message: string } {
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return { code: "request_failed", message: "请求失败" };
  }

  const code = readString(payload.error, "code");
  const message = readString(payload.error, "message");

  return {
    code: code && code.trim().length > 0 ? code : "request_failed",
    message: message && message.trim().length > 0 ? message : "请求失败",
  };
}

async function requestJson(
  path: string,
  init: RequestInit,
  fetcher: ChisaTalkFetch,
): Promise<unknown> {
  const response = await fetcher(`${CHISATALK_API_BASE_URL}${path}`, init);
  const payload = await readJson(response);

  if (!response.ok) {
    const errorMessage = getErrorMessage(payload);
    throw new ChisaTalkApiError({
      status: response.status,
      code: errorMessage.code,
      message: errorMessage.message,
    });
  }

  return payload;
}

export async function login(
  input: LoginInput,
  fetcher: ChisaTalkFetch = fetch,
): Promise<LoginResult> {
  const payload = await requestJson(
    "/v1/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    fetcher,
  );

  if (!isRecord(payload)) {
    throw new Error("登录响应格式不正确");
  }

  const accessToken = readString(payload, "accessToken");
  if (!accessToken) {
    throw new Error("登录响应缺少 accessToken");
  }

  return {
    accessToken,
    user: parseUser(payload.user),
  };
}

export async function getCurrentUser(
  accessToken: string,
  fetcher: ChisaTalkFetch = fetch,
): Promise<ChisaTalkUser> {
  const payload = await requestJson(
    "/v1/auth/me",
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    fetcher,
  );

  if (!isRecord(payload)) {
    throw new Error("用户响应格式不正确");
  }

  return parseUser(payload.user);
}

export async function getModels(
  accessToken: string,
  fetcher: ChisaTalkFetch = fetch,
): Promise<ChisaTalkModel[]> {
  const payload = await requestJson(
    "/v1/models",
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    fetcher,
  );

  if (!isRecord(payload) || !Array.isArray(payload.models)) {
    throw new Error("模型响应格式不正确");
  }

  return payload.models.map(parseModel);
}

export async function listConversations(
  accessToken: string,
  input: { limit: number; cursor?: string },
  fetcher: ChisaTalkFetch = fetch,
): Promise<{ items: ChisaTalkConversation[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ limit: String(input.limit) });
  if (input.cursor) {
    params.set("cursor", input.cursor);
  }
  const payload = await requestJson(
    `/v1/conversations?${params.toString()}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    fetcher,
  );

  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error("会话列表响应格式不正确");
  }

  const nextCursor = readNullableString(payload, "nextCursor");
  return {
    items: payload.items.map(parseConversation),
    nextCursor,
  };
}

export async function createConversation(
  accessToken: string,
  input: { title: string; modelId: string },
  fetcher: ChisaTalkFetch = fetch,
): Promise<ChisaTalkConversation> {
  const payload = await requestJson(
    "/v1/conversations",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    fetcher,
  );

  if (!isRecord(payload)) {
    throw new Error("创建会话响应格式不正确");
  }

  return parseConversation(payload.conversation);
}

export async function getConversation(
  accessToken: string,
  conversationId: string,
  fetcher: ChisaTalkFetch = fetch,
): Promise<{ conversation: ChisaTalkConversation; messages: ChisaTalkMessage[] }> {
  const payload = await requestJson(
    `/v1/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    fetcher,
  );

  if (!isRecord(payload) || !Array.isArray(payload.messages)) {
    throw new Error("会话详情响应格式不正确");
  }

  return {
    conversation: parseConversation(payload.conversation),
    messages: payload.messages.map(parseMessage),
  };
}

export async function createMessage(
  accessToken: string,
  conversationId: string,
  input: {
    role: ChisaTalkMessageRole;
    content: string;
    modelId: string;
    clientMessageId: string;
    providerMeta?: JsonValue;
  },
  fetcher: ChisaTalkFetch = fetch,
): Promise<{ message: ChisaTalkMessage; conversation: ChisaTalkConversation }> {
  const payload = await requestJson(
    `/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    fetcher,
  );

  if (!isRecord(payload)) {
    throw new Error("写入消息响应格式不正确");
  }

  return {
    message: parseMessage(payload.message),
    conversation: parseConversation(payload.conversation),
  };
}

export async function createChatCompletion(
  accessToken: string,
  conversationId: string,
  input: {
    content: string;
    modelId: string;
    clientMessageId: string;
    editMessageId?: string;
    providerMeta?: JsonValue;
    systemPrompt: string;
  },
  fetcher: ChisaTalkFetch = fetch,
  signal?: AbortSignal,
): Promise<{
  userMessage: ChisaTalkMessage;
  assistantMessage: ChisaTalkMessage;
  conversation: ChisaTalkConversation;
}> {
  const payload = await requestJson(
    `/v1/conversations/${encodeURIComponent(conversationId)}/chat-completions`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      signal,
      body: JSON.stringify(input),
    },
    fetcher,
  );

  if (!isRecord(payload)) {
    throw new Error("模型回复响应格式不正确");
  }

  return {
    userMessage: parseMessage(payload.userMessage),
    assistantMessage: parseMessage(payload.assistantMessage),
    conversation: parseConversation(payload.conversation),
  };
}

export async function updateConversation(
  accessToken: string,
  conversationId: string,
  input: { title?: string; modelId?: string; archived?: boolean },
  fetcher: ChisaTalkFetch = fetch,
): Promise<ChisaTalkConversation> {
  const payload = await requestJson(
    `/v1/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    fetcher,
  );

  if (!isRecord(payload)) {
    throw new Error("更新会话响应格式不正确");
  }

  return parseConversation(payload.conversation);
}
