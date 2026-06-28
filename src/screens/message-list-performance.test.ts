import { describe, expect, it } from "vitest";
import { buildMessageListData, getMessageListInitialRenderCount } from "./message-list-performance";

describe("message list performance helpers", () => {
  it("keeps a stable typed data shape for virtualized message rendering", () => {
    const messages = [
      { id: "user-1", role: "user", content: "你好" },
      { id: "assistant-1", role: "assistant", content: "你好，我是 ChisaTalk" },
    ];

    expect(buildMessageListData(messages)).toEqual([
      { type: "message", id: "user-1", message: messages[0] },
      { type: "message", id: "assistant-1", message: messages[1] },
    ]);
  });

  it("adds a transient streaming row without mutating persisted messages", () => {
    const messages = [{ id: "user-1", role: "user", content: "测试" }];
    const rows = buildMessageListData(messages, {
      isSending: true,
      streamingAssistantContent: "正在",
      agentProgressText: "检索记忆",
    });

    expect(messages).toHaveLength(1);
    expect(rows).toEqual([
      { type: "message", id: "user-1", message: messages[0] },
      {
        type: "streaming",
        id: "streaming-assistant",
        streamingAssistantContent: "正在",
        agentProgressText: "检索记忆",
      },
    ]);
  });

  it("bounds initial rendering for long histories", () => {
    expect(getMessageListInitialRenderCount(4)).toBe(4);
    expect(getMessageListInitialRenderCount(120)).toBe(16);
  });
});
