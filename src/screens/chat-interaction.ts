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

interface PendingHermesApprovalActionStateInput {
  providerMeta: unknown;
  isSending: boolean;
}

interface PendingHermesApprovalActionState {
  canRespond: boolean;
}

interface ReasoningDisclosureStateInput {
  messageId: string;
  expandedReasoningIds: ReadonlySet<string>;
}

interface ReasoningDisclosureState {
  isExpanded: boolean;
  actionText: "展开" | "收起";
  numberOfLines: number | undefined;
}

interface MessageRoleLabelInput {
  role: string;
  userDisplayName: string;
  assistantName: string;
}

interface MessageActionMessage {
  id: string;
  role: string;
  content: string;
}

interface MessageActionStateInput {
  message: MessageActionMessage;
  latestUserMessageId: string | null;
  isSending: boolean;
}

interface MessageActionState {
  canCopy: boolean;
  canEditAndRegenerate: boolean;
}

interface ConversationRecencyInput {
  updatedAt: string;
}

interface ConversationRecencyGroup<TConversation extends ConversationRecencyInput> {
  title: "今天" | "本周" | "更早";
  items: TConversation[];
}

interface WorkspaceStatusTextInput {
  hasActiveEnabledModel: boolean;
  isLoadingConversation: boolean;
  isSending: boolean;
}

interface AssistantProfileSummaryInput {
  aiName: string;
  personality: string;
  persona: string;
  userAddress: string;
}

const DEFAULT_CONVERSATION_TITLE = "新的会话";
const TITLE_LABEL_SEPARATOR_PATTERN = /^[\s/|·,，:：\-–—]+/;
const DEFAULT_PARTICIPANT_LABELS = ["你", "ChisaTalk"];
const TITLE_SEPARATOR_SOURCE = String.raw`[\s/|·,，:：\-–—]`;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeParticipantLabels(labels: string[]): string[] {
  return Array.from(
    new Set(labels.map((label) => label.trim()).filter((label) => label.length > 0)),
  );
}

export function formatConversationListTitle(
  title: string,
  participantLabels = DEFAULT_PARTICIPANT_LABELS,
): string {
  const normalizedTitle = title.trim().replace(/\s+/g, " ");
  if (!normalizedTitle) {
    return DEFAULT_CONVERSATION_TITLE;
  }

  let candidate = normalizedTitle;
  const removedLabels = new Set<string>();
  const labels = normalizeParticipantLabels([...participantLabels, ...DEFAULT_PARTICIPANT_LABELS]);
  const labelPattern = new RegExp(
    `^(${labels.map(escapeRegExp).join("|")})(?=$|${TITLE_SEPARATOR_SOURCE})`,
  );

  while (true) {
    const match = candidate.match(labelPattern);
    if (!match) {
      break;
    }

    removedLabels.add(match[1]);
    candidate = candidate.slice(match[0].length).replace(TITLE_LABEL_SEPARATOR_PATTERN, "");
  }

  if (removedLabels.size >= 2) {
    return candidate.trim() || DEFAULT_CONVERSATION_TITLE;
  }

  return normalizedTitle;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetweenLocalDates(value: Date, now: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor(
    (startOfLocalDay(now).getTime() - startOfLocalDay(value).getTime()) / msPerDay,
  );
}

function getConversationRecencyTitle(updatedAt: string, now: Date): ConversationRecencyGroup<ConversationRecencyInput>["title"] {
  const updatedDate = new Date(updatedAt);
  if (Number.isNaN(updatedDate.getTime())) {
    return "更早";
  }
  const dayDistance = daysBetweenLocalDates(updatedDate, now);
  if (dayDistance <= 0) {
    return "今天";
  }
  if (dayDistance <= 7) {
    return "本周";
  }
  return "更早";
}

export function groupConversationsByRecency<TConversation extends ConversationRecencyInput>(
  conversations: TConversation[],
  now = new Date(),
): ConversationRecencyGroup<TConversation>[] {
  const grouped: Record<ConversationRecencyGroup<TConversation>["title"], TConversation[]> = {
    今天: [],
    本周: [],
    更早: [],
  };

  conversations.forEach((conversation) => {
    grouped[getConversationRecencyTitle(conversation.updatedAt, now)].push(conversation);
  });

  return (["今天", "本周", "更早"] as const)
    .map((title) => ({ title, items: grouped[title] }))
    .filter((group) => group.items.length > 0);
}

export function getWorkspaceStatusText(input: WorkspaceStatusTextInput): string {
  if (!input.hasActiveEnabledModel) {
    return "Hermes 暂不可用";
  }
  if (input.isLoadingConversation) {
    return "正在载入会话";
  }
  if (input.isSending) {
    return "Hermes 正在回复";
  }
  return "Hermes 在线";
}

export function getAssistantProfileSummary(input: AssistantProfileSummaryInput): string {
  const aiName = input.aiName.trim() || "ChisaTalk";
  const userAddress = input.userAddress.trim();
  if (userAddress) {
    return `AI 名称：${aiName} · 称呼：${userAddress}`;
  }
  if (input.personality.trim()) {
    return `AI 名称：${aiName} · 已设置性格`;
  }
  if (input.persona.trim()) {
    return `AI 名称：${aiName} · 已设置人设`;
  }
  return `AI 名称：${aiName} · 未设置称呼`;
}

export function getMessageRoleLabel(input: MessageRoleLabelInput): string {
  if (input.role === "user") {
    return input.userDisplayName.trim() || "我";
  }
  if (input.role === "assistant") {
    return input.assistantName.trim() || "ChisaTalk";
  }
  return input.role;
}

export function getChatComposerState(input: ChatComposerStateInput): ChatComposerState {
  const hasSendableContent = input.draft.trim().length > 0 || input.hasImageAttachment === true;
  const canSend =
    hasSendableContent &&
    !input.isLoadingConversation &&
    !input.isSending &&
    input.hasActiveEnabledModel;

  return {
    canSend,
    editable: input.hasActiveEnabledModel,
  };
}

export function getSendButtonAccessibilityState(
  input: SendButtonAccessibilityStateInput,
): SendButtonAccessibilityState {
  return {
    disabled: !input.isSending && !input.canSend,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getPendingHermesApprovalActionState(
  input: PendingHermesApprovalActionStateInput,
): PendingHermesApprovalActionState {
  if (input.isSending || !isRecord(input.providerMeta)) {
    return { canRespond: false };
  }
  const pendingApproval = input.providerMeta.pendingApproval;
  return {
    canRespond: isRecord(pendingApproval) && typeof pendingApproval.runId === "string",
  };
}

export function getReasoningDisclosureState(
  input: ReasoningDisclosureStateInput,
): ReasoningDisclosureState {
  const isExpanded = input.expandedReasoningIds.has(input.messageId);
  return {
    isExpanded,
    actionText: isExpanded ? "收起" : "展开",
    numberOfLines: isExpanded ? undefined : 4,
  };
}

export function getLatestUserMessageId(messages: { id: string; role: string }[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return messages[index].id;
    }
  }
  return null;
}

export function getMessageActionState(input: MessageActionStateInput): MessageActionState {
  return {
    canCopy: input.message.content.trim().length > 0,
    canEditAndRegenerate:
      !input.isSending &&
      input.message.role === "user" &&
      input.message.id === input.latestUserMessageId &&
      input.message.content.trim().length > 0,
  };
}
