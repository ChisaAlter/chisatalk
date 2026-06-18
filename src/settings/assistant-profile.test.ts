import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAssistantProfileSystemPrompt,
  DEFAULT_ASSISTANT_PROFILE,
  saveAssistantProfile,
} from "./assistant-profile";

const asyncStorageMock = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    getItem: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
  };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: asyncStorageMock.getItem,
    removeItem: asyncStorageMock.removeItem,
    setItem: asyncStorageMock.setItem,
  },
}));

describe("assistant-profile", () => {
  beforeEach(() => {
    asyncStorageMock.store.clear();
    vi.clearAllMocks();
  });

  it("builds a system prompt from assistant profile settings", () => {
    expect(
      buildAssistantProfileSystemPrompt({
        aiName: "千咲",
        personality: "冷静、直接，但会照顾用户情绪",
        persona: "鸣潮风格的私人 AI 助手",
        userAddress: "指挥官",
      }),
    ).toBe(
      [
        "你的姓名是千咲。",
        "你对用户的称呼是：指挥官。",
        "你的性格：冷静、直接，但会照顾用户情绪",
        "你的人设：鸣潮风格的私人 AI 助手",
        "除非用户要求更改这些设定，否则始终保持以上姓名、称呼、性格和人设。",
        "回答可以使用 Markdown；如果需要表格，请使用普通 Markdown 表格，不要把表格放进代码块。",
      ].join("\n"),
    );
  });

  it("falls back to the default name when saved name is empty", async () => {
    const profile = await saveAssistantProfile({
      aiName: "   ",
      personality: "",
      persona: "",
      userAddress: "",
    });

    expect(profile.aiName).toBe(DEFAULT_ASSISTANT_PROFILE.aiName);
  });
});
