import { describe, expect, it, vi } from "vitest";
import {
  appendOrReplaceMessage,
  createClientMessageId,
  formatAgentProgress,
  getDefaultModelId,
  moveConversationToTop,
  replaceMessageAndDropFollowing,
} from "./chat-workspace-utils";
import type { ChisaTalkConversation, ChisaTalkMessage, ChisaTalkModel } from "@/api/chisatalk-client";

const baseConversation: ChisaTalkConversation = {
  id: "conv-1",
  title: "会话",
  userId: "user-1",
  modelId: "hermes",
  archived: false,
  createdAt: "2026-06-27T00:00:00.000Z",
  updatedAt: "2026-06-27T00:00:00.000Z",
};

function message(id: string, role: ChisaTalkMessage["role"], content = id): ChisaTalkMessage {
  return {
    id,
    role,
    content,
    conversationId: "conv-1",
    modelId: "hermes",
    clientMessageId: null,
    providerMeta: null,
    createdAt: "2026-06-27T00:00:00.000Z",
  };
}

describe("chat workspace utils", () => {
  it("prefers an enabled Hermes Agent model as the default", () => {
    const models: ChisaTalkModel[] = [
      {
        id: "glm",
        label: "GLM",
        provider: "mimo",
        providerType: "openai-compatible",
        model: "mimo-v2.5",
        enabled: true,
        supportsStreaming: false,
      },
      {
        id: "hermes",
        label: "Hermes",
        provider: "hermes",
        providerType: "hermes-agent",
        model: "hermes-agent",
        enabled: true,
        supportsStreaming: true,
      },
    ];

    expect(getDefaultModelId(models)).toBe("hermes");
  });

  it("moves the active conversation to the top without duplicating it", () => {
    const other = { ...baseConversation, id: "conv-2" };

    expect(moveConversationToTop([baseConversation, other], other)).toEqual([other, baseConversation]);
  });

  it("replaces an edited user message and drops following assistant turns", () => {
    const original = [message("u1", "user", "旧问题"), message("a1", "assistant", "旧回答")];
    const edited = message("u1", "user", "新问题");

    expect(replaceMessageAndDropFollowing(original, edited)).toEqual([edited]);
  });

  it("appends or replaces streamed messages by id", () => {
    const first = message("a1", "assistant", "旧");
    const next = message("a1", "assistant", "新");

    expect(appendOrReplaceMessage([first], next)).toEqual([next]);
    expect(appendOrReplaceMessage([], next)).toEqual([next]);
  });

  it("formats Hermes progress metadata for the UI", () => {
    expect(formatAgentProgress({ toolName: "memory", status: "running" })).toBe("memory：running");
    expect(formatAgentProgress({ message: "检索记忆" })).toBe("检索记忆");
    expect(formatAgentProgress(null)).toBe("Hermes Agent 正在调用工具");
  });

  it("generates unique client message ids with the expected prefix", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_772_000_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0.123456);

    expect(createClientMessageId()).toMatch(/^client_/);

    vi.restoreAllMocks();
  });
});
