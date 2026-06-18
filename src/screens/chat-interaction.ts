interface ChatComposerStateInput {
  draft: string;
  hasActiveEnabledModel: boolean;
  hasImageAttachment?: boolean;
  hasSelectedConversation?: boolean;
  isLoadingConversation: boolean;
  isSending: boolean;
}

interface ChatComposerState {
  canSend: boolean;
  editable: boolean;
}

interface SendButtonAccessibilityStateInput {
  canSend: boolean;
  isSending: boolean;
}

interface SendButtonAccessibilityState {
  disabled: boolean;
}

interface ReasoningDisclosureStateInput {
  messageId: string;
  expandedReasoningIds: ReadonlySet<string>;
}

interface ReasoningDisclosureState {
  isExpanded: boolean;
  actionText: "展开" | "收起";
  numberOfLines: 1 | undefined;
}

export function getChatComposerState(input: ChatComposerStateInput): ChatComposerState {
  const hasSendableContent = input.draft.trim().length > 0 || input.hasImageAttachment === true;
  const canSend =
    hasSendableContent &&
    !input.isSending &&
    !input.isLoadingConversation &&
    input.hasActiveEnabledModel;

  return {
    canSend,
    editable: input.hasActiveEnabledModel && !input.isSending,
  };
}

export function getSendButtonAccessibilityState(
  input: SendButtonAccessibilityStateInput,
): SendButtonAccessibilityState {
  return {
    disabled: !input.canSend,
  };
}

export function getReasoningDisclosureState(
  input: ReasoningDisclosureStateInput,
): ReasoningDisclosureState {
  const isExpanded = input.expandedReasoningIds.has(input.messageId);
  return {
    isExpanded,
    actionText: isExpanded ? "收起" : "展开",
    numberOfLines: isExpanded ? undefined : 1,
  };
}
