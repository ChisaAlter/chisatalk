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
    ).toBe("检索记忆\nweb_search：done");
  });

  it("returns null when no displayable reasoning exists", () => {
    expect(readMessageReasoning({ toolProgress: [] })).toBeNull();
    expect(readMessageReasoning(null)).toBeNull();
  });
});
