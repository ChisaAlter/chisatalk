import { describe, expect, it } from "vitest";
import {
  formatConversationListTitle,
  getMessageRoleLabel,
  getChatComposerState,
  getLatestUserMessageId,
  getMessageActionState,
  getPendingHermesApprovalActionState,
  getReasoningDisclosureState,
  getSendButtonAccessibilityState,
} from "./chat-interaction";

describe("getChatComposerState", () => {
  it("allows the first message when an enabled model is selected but no conversation exists", () => {
    expect(
      getChatComposerState({
        draft: "你好",
        hasActiveEnabledModel: true,
        isLoadingConversation: false,
        isSending: false,
      }),
    ).toEqual({ canSend: true, editable: true });
  });

  it("keeps the composer disabled until an enabled model is available", () => {
    expect(
      getChatComposerState({
        draft: "你好",
        hasActiveEnabledModel: false,
        isLoadingConversation: false,
        isSending: false,
      }),
    ).toEqual({ canSend: false, editable: false });
  });

  it("allows sending when only an image is attached", () => {
    expect(
      getChatComposerState({
        draft: "",
        hasActiveEnabledModel: true,
        hasImageAttachment: true,
        isLoadingConversation: false,
        isSending: false,
      }),
    ).toEqual({ canSend: true, editable: true });
  });

  it("keeps the composer editable but prevents starting a second send while streaming", () => {
    expect(
      getChatComposerState({
        draft: "换一个问题",
        hasActiveEnabledModel: true,
        isLoadingConversation: false,
        isSending: true,
      }),
    ).toEqual({ canSend: false, editable: true });
  });
});

describe("getSendButtonAccessibilityState", () => {
  it("omits busy after sending finishes so Android clears the busy announcement", () => {
    expect(getSendButtonAccessibilityState({ canSend: false, isSending: false })).toEqual({
      disabled: true,
    });
  });

  it("keeps the button enabled while sending so it can act as stop", () => {
    expect(getSendButtonAccessibilityState({ canSend: false, isSending: true })).toEqual({
      disabled: false,
    });
  });
});

describe("getPendingHermesApprovalActionState", () => {
  it("enables approval controls only for pending Hermes approval messages", () => {
    expect(
      getPendingHermesApprovalActionState({
        providerMeta: {
          source: "hermes-agent",
          pendingApproval: { runId: "run-1" },
        },
        isSending: false,
      }),
    ).toEqual({ canRespond: true });

    expect(
      getPendingHermesApprovalActionState({
        providerMeta: { source: "hermes-agent" },
        isSending: false,
      }),
    ).toEqual({ canRespond: false });
  });

  it("disables approval controls while another request is in flight", () => {
    expect(
      getPendingHermesApprovalActionState({
        providerMeta: {
          source: "hermes-agent",
          pendingApproval: { runId: "run-1" },
        },
        isSending: true,
      }),
    ).toEqual({ canRespond: false });
  });
});

describe("getReasoningDisclosureState", () => {
  it("shows a readable multi-line reasoning preview by default", () => {
    expect(
      getReasoningDisclosureState({
        messageId: "message-1",
        expandedReasoningIds: new Set(),
      }),
    ).toEqual({
      isExpanded: false,
      actionText: "展开",
      numberOfLines: 4,
    });
  });

  it("shows completed reasoning fully after the player expands it", () => {
    expect(
      getReasoningDisclosureState({
        messageId: "message-1",
        expandedReasoningIds: new Set(["message-1"]),
      }),
    ).toEqual({
      isExpanded: true,
      actionText: "收起",
      numberOfLines: undefined,
    });
  });
});

describe("formatConversationListTitle", () => {
  it("removes participant labels from generated conversation list titles", () => {
    expect(formatConversationListTitle("你 ChisaTalk")).toBe("新的会话");
    expect(formatConversationListTitle("你 / ChisaTalk：总结今天的计划")).toBe("总结今天的计划");
    expect(formatConversationListTitle("ChisaTalk - 你 - 角色设定")).toBe("角色设定");
    expect(formatConversationListTitle("Ayase / 千咲：赛道攻略", ["Ayase", "千咲"])).toBe("赛道攻略");
  });

  it("keeps normal conversation titles intact", () => {
    expect(formatConversationListTitle("你觉得这个方案怎么样")).toBe("你觉得这个方案怎么样");
    expect(formatConversationListTitle("新的会话")).toBe("新的会话");
  });
});

describe("getMessageRoleLabel", () => {
  it("uses account and profile names instead of fixed role labels", () => {
    expect(
      getMessageRoleLabel({
        role: "user",
        userDisplayName: "Ayase",
        assistantName: "千咲",
      }),
    ).toBe("Ayase");

    expect(
      getMessageRoleLabel({
        role: "assistant",
        userDisplayName: "Ayase",
        assistantName: "千咲",
      }),
    ).toBe("千咲");
  });
});

describe("message actions", () => {
  it("finds the latest user message id", () => {
    expect(
      getLatestUserMessageId([
        { id: "user-1", role: "user" },
        { id: "assistant-1", role: "assistant" },
        { id: "user-2", role: "user" },
      ]),
    ).toBe("user-2");
  });

  it("allows copying any text message but edits only the latest user message", () => {
    expect(
      getMessageActionState({
        message: { id: "assistant-1", role: "assistant", content: "回答" },
        latestUserMessageId: "user-1",
        isSending: false,
      }),
    ).toEqual({ canCopy: true, canEditAndRegenerate: false });

    expect(
      getMessageActionState({
        message: { id: "user-1", role: "user", content: "问题" },
        latestUserMessageId: "user-1",
        isSending: false,
      }),
    ).toEqual({ canCopy: true, canEditAndRegenerate: true });
  });

  it("disables editing while a response is streaming", () => {
    expect(
      getMessageActionState({
        message: { id: "user-1", role: "user", content: "问题" },
        latestUserMessageId: "user-1",
        isSending: true,
      }),
    ).toEqual({ canCopy: true, canEditAndRegenerate: false });
  });
});
