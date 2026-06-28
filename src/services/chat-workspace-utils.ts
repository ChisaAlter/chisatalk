import {
  ChisaTalkApiError,
  type ChisaTalkConversation,
  type ChisaTalkMessage,
  type ChisaTalkModel,
  type JsonValue,
} from "@/api/chisatalk-client";

export function getReadableError(error: unknown): string {
  if (error instanceof ChisaTalkApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败";
}

export function isRequestCancelled(error: unknown): boolean {
  return error instanceof Error && error.message === "Hermes Agent 请求已取消";
}

export function createClientMessageId(): string {
  return `client_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatAgentProgress(value: JsonValue): string {
  if (!isRecord(value)) {
    return "Hermes Agent 正在调用工具";
  }
  const message = typeof value.message === "string" ? value.message.trim() : "";
  const toolName = typeof value.toolName === "string" ? value.toolName.trim() : "";
  const status = typeof value.status === "string" ? value.status.trim() : "";

  if (message.length > 0) {
    return message;
  }
  if (toolName.length > 0 && status.length > 0) {
    return `${toolName}：${status}`;
  }
  if (toolName.length > 0) {
    return `正在使用 ${toolName}`;
  }
  return "Hermes Agent 正在调用工具";
}

export function moveConversationToTop(
  conversations: ChisaTalkConversation[],
  nextConversation: ChisaTalkConversation,
): ChisaTalkConversation[] {
  return [
    nextConversation,
    ...conversations.filter((conversation) => conversation.id !== nextConversation.id),
  ];
}

export function getDefaultModelId(models: ChisaTalkModel[]): string | null {
  return (
    models.find((model) => model.enabled && model.providerType === "hermes-agent")?.id ??
    models.find((model) => model.enabled)?.id ??
    null
  );
}

export function replaceMessageAndDropFollowing(
  messages: ChisaTalkMessage[],
  nextMessage: ChisaTalkMessage,
): ChisaTalkMessage[] {
  const index = messages.findIndex((message) => message.id === nextMessage.id);
  if (index === -1) {
    return [...messages, nextMessage];
  }
  return [...messages.slice(0, index), nextMessage];
}

export function appendOrReplaceMessage(
  messages: ChisaTalkMessage[],
  nextMessage: ChisaTalkMessage,
): ChisaTalkMessage[] {
  const index = messages.findIndex((message) => message.id === nextMessage.id);
  if (index === -1) {
    return [...messages, nextMessage];
  }
  const nextMessages = [...messages];
  nextMessages[index] = nextMessage;
  return nextMessages;
}
