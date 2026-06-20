import {
  CHISATALK_API_BASE_URL,
  type ChisaTalkConversation,
  type ChisaTalkImageAttachment,
  type ChisaTalkMessage,
  type JsonValue,
} from "./chisatalk-client";

export type AgentTurnStreamEvent =
  | { type: "user_message"; message: ChisaTalkMessage; conversation: ChisaTalkConversation }
  | { type: "assistant_delta"; delta: string }
  | { type: "tool_progress"; data: JsonValue }
  | { type: "assistant_message"; message: ChisaTalkMessage; conversation: ChisaTalkConversation }
  | { type: "done" }
  | { type: "error"; code: string; message: string };

export interface StreamAgentTurnInput {
  content: string;
  modelId: string;
  clientMessageId: string;
  editMessageId?: string;
  providerMeta?: JsonValue;
  systemPrompt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function readNullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
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
    for (const [childKey, childValue] of Object.entries(value)) {
      parsed[childKey] = parseJsonValue(childValue);
    }
    return parsed;
  }
  return null;
}

function parseConversation(value: unknown): ChisaTalkConversation {
  if (!isRecord(value)) {
    throw new Error("会话信息格式不正确");
  }
  return {
    id: readString(value, "id"),
    title: readString(value, "title"),
    userId: readString(value, "userId"),
    modelId: readNullableString(value, "modelId"),
    archived: readBoolean(value, "archived"),
    createdAt: readString(value, "createdAt"),
    updatedAt: readString(value, "updatedAt"),
  };
}

function parseMessage(value: unknown): ChisaTalkMessage {
  if (!isRecord(value)) {
    throw new Error("消息格式不正确");
  }
  const role = value.role;
  if (role !== "system" && role !== "user" && role !== "assistant") {
    throw new Error("消息角色格式不正确");
  }
  const providerMeta = "providerMeta" in value ? parseJsonValue(value.providerMeta) : null;
  return {
    id: readString(value, "id"),
    conversationId: readString(value, "conversationId"),
    role,
    content: readString(value, "content"),
    modelId: readNullableString(value, "modelId"),
    clientMessageId: readNullableString(value, "clientMessageId"),
    providerMeta,
    createdAt: readString(value, "createdAt"),
  };
}

function parseSseBlock(block: string): { event: string; data: unknown } | null {
  let event = "message";
  const dataLines: string[] = [];
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
  return { event, data: JSON.parse(dataLines.join("\n")) as unknown };
}

function parseAgentTurnEvent(input: { event: string; data: unknown }): AgentTurnStreamEvent | null {
  if (input.event === "done") {
    return { type: "done" };
  }
  if (input.event === "assistant_delta" && isRecord(input.data)) {
    return { type: "assistant_delta", delta: readString(input.data, "delta") };
  }
  if (input.event === "tool_progress") {
    return { type: "tool_progress", data: parseJsonValue(input.data) };
  }
  if ((input.event === "user_message" || input.event === "assistant_message") && isRecord(input.data)) {
    return {
      type: input.event,
      message: parseMessage(input.data.message),
      conversation: parseConversation(input.data.conversation),
    };
  }
  if (input.event === "error" && isRecord(input.data)) {
    return {
      type: "error",
      code: readString(input.data, "code") || "stream_error",
      message: readString(input.data, "message") || "流式请求失败",
    };
  }
  return null;
}

export function createAgentTurnSseParser() {
  let buffer = "";

  return {
    push(chunk: string): AgentTurnStreamEvent[] {
      buffer += chunk;
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";

      const events: AgentTurnStreamEvent[] = [];
      for (const block of blocks) {
        const parsedBlock = parseSseBlock(block);
        if (!parsedBlock) {
          continue;
        }
        const event = parseAgentTurnEvent(parsedBlock);
        if (event) {
          events.push(event);
        }
      }
      return events;
    },
  };
}

export async function streamAgentTurn(input: {
  accessToken: string;
  conversationId: string;
  signal?: AbortSignal;
  input: StreamAgentTurnInput;
  onEvent: (event: AgentTurnStreamEvent) => void;
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const parser = createAgentTurnSseParser();
    let readOffset = 0;
    let settled = false;
    const abortError = new Error("Hermes Agent 请求已取消");
    const cleanupAbortListener = () => {
      input.signal?.removeEventListener("abort", handleAbort);
    };
    const resolveOnce = () => {
      if (!settled) {
        settled = true;
        cleanupAbortListener();
        resolve();
      }
    };
    const rejectOnce = (error: Error) => {
      if (!settled) {
        settled = true;
        cleanupAbortListener();
        reject(error);
      }
    };
    const handleAbort = () => {
      xhr.abort();
      rejectOnce(abortError);
    };
    const readAvailableEvents = () => {
      const nextText = xhr.responseText.slice(readOffset);
      readOffset = xhr.responseText.length;
      for (const event of parser.push(nextText)) {
        input.onEvent(event);
        if (event.type === "assistant_message" || event.type === "done") {
          resolveOnce();
        }
      }
    };

    xhr.open(
      "POST",
      `${CHISATALK_API_BASE_URL}/v1/conversations/${encodeURIComponent(input.conversationId)}/agent-turns/stream`,
    );
    xhr.setRequestHeader("Authorization", `Bearer ${input.accessToken}`);
    xhr.setRequestHeader("Content-Type", "application/json");

    xhr.onprogress = readAvailableEvents;
    xhr.onload = () => {
      readAvailableEvents();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolveOnce();
        return;
      }
      rejectOnce(new Error("Hermes Agent 请求失败"));
    };
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) {
        return;
      }
      readAvailableEvents();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolveOnce();
        return;
      }
      rejectOnce(new Error("Hermes Agent 请求失败"));
    };
    xhr.onerror = () => rejectOnce(new Error("Hermes Agent 网络请求失败"));
    xhr.onabort = () => rejectOnce(abortError);
    input.signal?.addEventListener("abort", handleAbort, { once: true });
    if (input.signal?.aborted) {
      handleAbort();
      return;
    }
    xhr.send(JSON.stringify(input.input));
  });
}

export function buildAgentProviderMeta(attachments: ChisaTalkImageAttachment[]): JsonValue | undefined {
  return attachments.length > 0 ? { source: "mobile", attachments } : { source: "mobile" };
}
