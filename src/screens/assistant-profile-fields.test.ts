import { describe, expect, it } from "vitest";
import { getAssistantProfileFields } from "./assistant-profile-fields";

describe("getAssistantProfileFields", () => {
  it("defines the editable assistant persona fields shown in settings", () => {
    expect(getAssistantProfileFields()).toEqual([
      {
        key: "aiName",
        label: "AI 名称",
        placeholder: "例如：千咲",
        multiline: false,
      },
      {
        key: "userAddress",
        label: "对你的称呼",
        placeholder: "例如：指挥官",
        multiline: false,
      },
      {
        key: "personality",
        label: "性格",
        placeholder: "冷静、直接、照顾情绪",
        multiline: true,
      },
      {
        key: "persona",
        label: "人设",
        placeholder: "鸣潮风格私人 AI 助手",
        multiline: true,
      },
    ]);
  });
});
