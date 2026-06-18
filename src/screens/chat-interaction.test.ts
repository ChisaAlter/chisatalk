import { describe, expect, it } from "vitest";
import {
  getChatComposerState,
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
});

describe("getSendButtonAccessibilityState", () => {
  it("omits busy after sending finishes so Android clears the busy announcement", () => {
    expect(getSendButtonAccessibilityState({ canSend: false, isSending: false })).toEqual({
      disabled: true,
    });
  });

  it("does not set busy while sending because Android can keep the announcement stuck", () => {
    expect(getSendButtonAccessibilityState({ canSend: false, isSending: true })).toEqual({
      disabled: true,
    });
  });
});

describe("getReasoningDisclosureState", () => {
  it("collapses completed reasoning to a single preview line by default", () => {
    expect(
      getReasoningDisclosureState({
        messageId: "message-1",
        expandedReasoningIds: new Set(),
      }),
    ).toEqual({
      isExpanded: false,
      actionText: "展开",
      numberOfLines: 1,
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
