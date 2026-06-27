import { describe, expect, it } from "vitest";
import { readMessageReasoning } from "./message-reasoning";

describe("message-reasoning", () => {
  it("reads provider reasoning content for display", () => {
    expect(
      readMessageReasoning({
        reasoningContent: "先检查上下文，再生成回复。",
      }),
    ).toBe("先检查上下文，再生成回复。");
  });

  it("summarizes Hermes tool progress when no explicit reasoning is present", () => {
    expect(
      readMessageReasoning({
        toolProgress: [
          { toolName: "memory", status: "running", message: "检索记忆" },
          { toolName: "web_search", status: "done" },
        ],
      }),
    ).toBe("检索记忆\n联网搜索：已完成");
  });

  it("summarizes Hermes progress events that use title and state fields", () => {
    expect(
      readMessageReasoning({
        toolProgress: [
          { title: "联网搜索", state: "running" },
          { name: "memory", phase: "done" },
        ],
      }),
    ).toBe("联网搜索：进行中\n检索记忆：已完成");
  });

  it("summarizes pending approval as a readable confirmation prompt", () => {
    expect(
      readMessageReasoning({
        toolProgress: [
          {
            event: "approval.request",
            tool: "terminal",
            description: "git clone operation",
          },
        ],
      }),
    ).toBe("等待你确认：git clone operation");
  });

  it("returns null when no displayable reasoning exists", () => {
    expect(readMessageReasoning({ toolProgress: [] })).toBeNull();
    expect(readMessageReasoning(null)).toBeNull();
  });
});
