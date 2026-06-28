import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Alert,
  Easing,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { ImagePlus, LogOut, Menu, Plus, RefreshCw, Send, Settings, Square, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { AnimatedPressable } from "@/components/animated-pressable";
import { getAssistantProfileFields } from "./assistant-profile-fields";
import {
  formatConversationListTitle,
  getChatComposerState,
  getLatestUserMessageId,
  getMessageRoleLabel,
  getMessageActionState,
  getPendingHermesApprovalActionState,
  getReasoningDisclosureState,
  getSendButtonAccessibilityState,
} from "./chat-interaction";
import { MessageContent } from "./message-content";
import {
  buildMessageListData,
  getMessageListInitialRenderCount,
  type MessageListRow,
} from "./message-list-performance";
import { readMessageReasoning } from "./message-reasoning";
import { readMessageImageAttachments } from "@/api/message-attachments";
import type {
  ChisaTalkConversation,
  ChisaTalkImageAttachment,
  ChisaTalkMessage,
  ChisaTalkModel,
  ChisaTalkUser,
} from "@/api/chisatalk-client";
import type { AssistantProfile } from "@/settings/assistant-profile";

interface ChatScreenProps {
  user: ChisaTalkUser;
  models: ChisaTalkModel[];
  selectedModelId: string | null;
  conversations: ChisaTalkConversation[];
  selectedConversation: ChisaTalkConversation | null;
  messages: ChisaTalkMessage[];
  errorMessage: string | null;
  isRefreshing: boolean;
  isLoadingConversation: boolean;
  isPickingImage: boolean;
  isSending: boolean;
  pendingImage: ChisaTalkImageAttachment | null;
  streamingAssistantContent: string;
  agentProgressText: string | null;
  assistantProfile: AssistantProfile;
  onRefresh: () => Promise<void>;
  onLogout: () => Promise<void>;
  onCreateConversation: () => Promise<void>;
  onSelectConversation: (conversationId: string) => Promise<void>;
  onDeleteConversation: (conversationId: string) => Promise<void>;
  onPickImage: () => Promise<void>;
  onClearImage: () => void;
  onSaveAssistantProfile: (profile: AssistantProfile) => Promise<void>;
  onSendMessage: (content: string, attachments: ChisaTalkImageAttachment[]) => Promise<void>;
  onStopSending: () => void;
  onEditLastUserMessage: (messageId: string, content: string) => Promise<void>;
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  topBar: {
    minHeight: 64,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[1],
    paddingBottom: theme.spacing[3],
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    backgroundColor: theme.colors.surface0,
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.full,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface1,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadow.sm,
  },
  titleBlock: {
    flex: 1,
    gap: theme.spacing[1],
  },
  appName: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 0,
    includeFontPadding: false,
  },
  subText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    includeFontPadding: false,
  },
  body: {
    flex: 1,
  },
  sidebar: {
    position: "absolute",
    zIndex: 3,
    top: 0,
    bottom: 0,
    left: 0,
    width: "86%",
    maxWidth: 380,
    backgroundColor: theme.colors.surface1,
    paddingTop: theme.spacing[5],
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[4],
    gap: theme.spacing[4],
    ...theme.shadow.lg,
  },
  sidebarBackdrop: {
    position: "absolute",
    zIndex: 2,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0, 0, 0, 0.42)",
  },
  backdropPressable: {
    flex: 1,
  },
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    paddingBottom: theme.spacing[1],
  },
  sidebarBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  sidebarMark: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.foreground,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sidebarMarkText: {
    color: theme.colors.surface0,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
  },
  sidebarTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    includeFontPadding: false,
  },
  userText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    includeFontPadding: false,
  },
  actionStack: {
    gap: theme.spacing[2],
  },
  actionButton: {
    minHeight: 46,
    borderRadius: theme.borderRadius.xl,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  actionButtonPrimary: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
    minHeight: 50,
    borderRadius: theme.borderRadius.xl,
    ...theme.shadow.sm,
  },
  secondaryActionRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  secondaryActionButton: {
    flex: 1,
  },
  utilityActionButton: {
    minHeight: 44,
  },
  actionText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    textAlign: "center",
    includeFontPadding: false,
  },
  actionTextPrimary: {
    color: theme.colors.accentForeground,
  },
  sectionLabel: {
    color: theme.colors.foregroundSubtle,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 0,
    marginTop: theme.spacing[1],
  },
  conversationScroll: {
    flex: 1,
  },
  conversationList: {
    gap: theme.spacing[2],
    paddingBottom: theme.spacing[8],
  },
  conversationItem: {
    borderRadius: theme.borderRadius.xl,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    minHeight: 58,
    justifyContent: "center",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[1],
  },
  conversationItemActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
    borderLeftWidth: theme.borderWidth[2],
  },
  conversationTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    includeFontPadding: false,
  },
  conversationTime: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    includeFontPadding: false,
  },
  emptySidebar: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  settingsScroll: {
    flex: 1,
  },
  settingsContent: {
    gap: theme.spacing[3],
    paddingBottom: theme.spacing[8],
  },
  settingsPanel: {
    borderRadius: theme.borderRadius.xl,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface0,
    padding: theme.spacing[3],
    gap: theme.spacing[3],
  },
  settingsField: {
    gap: theme.spacing[2],
  },
  settingsLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    includeFontPadding: false,
  },
  settingsInput: {
    minHeight: 46,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    paddingHorizontal: theme.spacing[3],
    paddingTop: 0,
    paddingBottom: 0,
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  settingsTextArea: {
    minHeight: 84,
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[3],
    textAlignVertical: "top",
  },
  settingsHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 18,
    includeFontPadding: false,
  },
  settingsButtonRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  settingsSaveButton: {
    flex: 1,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[4],
    gap: theme.spacing[3],
    width: "100%",
  },
  messageRow: {
    width: "100%",
  },
  userMessageRow: {
    alignItems: "flex-end",
  },
  assistantMessageRow: {
    alignItems: "flex-start",
  },
  messageBubble: {
    maxWidth: "84%",
    borderRadius: 18,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[2],
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accent,
    borderRightWidth: theme.borderWidth[2],
    borderTopRightRadius: theme.borderRadius.lg,
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.border,
    ...theme.shadow.sm,
    borderTopLeftRadius: theme.borderRadius.lg,
  },
  roleText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    includeFontPadding: false,
  },
  userRoleText: {
    color: theme.colors.foregroundMuted,
  },
  assistantRoleText: {
    color: theme.colors.foregroundMuted,
  },
  messageText: {
    fontSize: theme.fontSize.base,
    lineHeight: 24,
    includeFontPadding: false,
  },
  userMessageText: {
    color: theme.colors.foreground,
  },
  assistantMessageText: {
    color: theme.colors.foreground,
  },
  reasoningCard: {
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  reasoningHeader: {
    minHeight: 38,
    paddingHorizontal: theme.spacing[3],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  reasoningTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    includeFontPadding: false,
  },
  reasoningMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    includeFontPadding: false,
  },
  reasoningBody: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[3],
    includeFontPadding: false,
  },
  thinkingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    includeFontPadding: false,
  },
  thinkingDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingTop: theme.spacing[1],
  },
  thinkingDot: {
    width: 7,
    height: 7,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
    opacity: 0.28,
  },
  thinkingDotActive: {
    opacity: 1,
  },
  emptyMain: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[8],
    gap: theme.spacing[4],
  },
  emptyMark: {
    width: 68,
    height: 68,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.foreground,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadow.md,
  },
  emptyMarkText: {
    color: theme.colors.accentForeground,
    fontSize: theme.fontSize["2xl"],
    fontWeight: theme.fontWeight.bold,
    includeFontPadding: false,
  },
  emptyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize["3xl"],
    fontWeight: theme.fontWeight.bold,
    textAlign: "center",
    includeFontPadding: false,
  },
  emptyBody: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    textAlign: "center",
  },
  emptyActionButton: {
    minHeight: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
  },
  emptyActionText: {
    color: theme.colors.accentForeground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    includeFontPadding: false,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    marginHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  composer: {
    minHeight: 64,
    padding: theme.spacing[2],
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surface1,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderRadius: theme.borderRadius.xl,
    borderWidth: theme.borderWidth[0],
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: 22,
    paddingHorizontal: theme.spacing[4],
    paddingTop: 0,
    paddingBottom: 0,
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  inputSingleLine: {
    height: 48,
    minHeight: 48,
  },
  inputMultiline: {
    minHeight: 48,
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[3],
    textAlignVertical: "top",
  },
  attachButton: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface0,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: theme.opacity[50],
  },
  approvalButtonRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  approvalButton: {
    minHeight: 40,
    minWidth: 88,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    alignItems: "center",
    justifyContent: "center",
    borderWidth: theme.borderWidth[1],
  },
  approvalButtonPrimary: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  approvalButtonSecondary: {
    backgroundColor: theme.colors.surface0,
    borderColor: theme.colors.borderStrong,
  },
  approvalButtonTextPrimary: {
    color: theme.colors.accentForeground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    includeFontPadding: false,
  },
  approvalButtonTextSecondary: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    includeFontPadding: false,
  },
  composerStack: {
    marginHorizontal: 0,
    marginBottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface1,
    ...theme.shadow.md,
    overflow: "hidden",
  },
  imagePreviewRow: {
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[1],
    flexDirection: "row",
  },
  imagePreview: {
    width: 96,
    height: 96,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  removeImageButton: {
    position: "absolute",
    top: theme.spacing[1],
    right: theme.spacing[1],
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.full,
    backgroundColor: "rgba(0, 0, 0, 0.62)",
    alignItems: "center",
    justifyContent: "center",
  },
  messageImage: {
    width: 220,
    height: 156,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.38)",
    paddingHorizontal: theme.spacing[4],
  },
  editPanel: {
    borderRadius: theme.borderRadius.xl,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[4],
    gap: theme.spacing[3],
    ...theme.shadow.lg,
  },
  editTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    includeFontPadding: false,
  },
  editInput: {
    minHeight: 132,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: 22,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    textAlignVertical: "top",
  },
  editButtonRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  editCancelButton: {
    flex: 1,
  },
  editSubmitButton: {
    flex: 1,
  },
}));

function formatTime(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}

function modelTitle(model: ChisaTalkModel): string {
  return `${model.label} / ${model.model}`;
}

export function ChatScreen({
  user,
  models,
  selectedModelId,
  conversations,
  selectedConversation,
  messages,
  errorMessage,
  isRefreshing,
  isLoadingConversation,
  isPickingImage,
  isSending,
  pendingImage,
  streamingAssistantContent,
  agentProgressText,
  assistantProfile,
  onRefresh,
  onLogout,
  onCreateConversation,
  onSelectConversation,
  onDeleteConversation,
  onPickImage,
  onClearImage,
  onSaveAssistantProfile,
  onSendMessage,
  onStopSending,
  onEditLastUserMessage,
}: ChatScreenProps) {
  const { theme } = useUnistyles();
  const messagesScrollRef = useRef<FlatList<MessageListRow<ChisaTalkMessage>>>(null);
  const sidebarProgress = useRef(new Animated.Value(0)).current;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<AssistantProfile>(assistantProfile);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Set<string>>(() => new Set());
  const [thinkingFrame, setThinkingFrame] = useState(0);
  const [editingMessage, setEditingMessage] = useState<ChisaTalkMessage | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [draft, setDraft] = useState("");
  const isDraftMultiline = draft.includes("\n") || draft.length > 28;

  const scrollToLatest = useCallback((animated = true) => {
    setTimeout(() => {
      messagesScrollRef.current?.scrollToEnd({ animated });
    }, 50);
  }, []);

  const openSidebar = useCallback(() => {
    sidebarProgress.stopAnimation();
    setSidebarOpen(true);
    Animated.spring(sidebarProgress, {
      toValue: 1,
      damping: 24,
      stiffness: 260,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [sidebarProgress]);

  const closeSidebar = useCallback(() => {
    sidebarProgress.stopAnimation();
    Animated.timing(sidebarProgress, {
      toValue: 0,
      duration: 160,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setSidebarOpen(false);
        setSettingsOpen(false);
      }
    });
  }, [sidebarProgress]);

  const openSettings = useCallback(() => {
    setSettingsDraft(assistantProfile);
    setSettingsOpen(true);
  }, [assistantProfile]);

  const closeSettings = useCallback(() => {
    setSettingsDraft(assistantProfile);
    setSettingsOpen(false);
  }, [assistantProfile]);

  const saveSettings = useCallback(async () => {
    setIsSavingSettings(true);
    try {
      await onSaveAssistantProfile(settingsDraft);
      setSettingsOpen(false);
    } finally {
      setIsSavingSettings(false);
    }
  }, [onSaveAssistantProfile, settingsDraft]);

  const toggleReasoning = useCallback((messageId: string) => {
    setExpandedReasoningIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  const confirmDeleteConversation = useCallback(
    (conversation: ChisaTalkConversation) => {
      Alert.alert("删除会话", `确定删除“${conversation.title}”？`, [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: () => {
            void onDeleteConversation(conversation.id);
          },
        },
      ]);
    },
    [onDeleteConversation],
  );

  const showCopiedFeedback = useCallback(() => {
    if (Platform.OS === "android") {
      ToastAndroid.show("已复制", ToastAndroid.SHORT);
      return;
    }
    Alert.alert("已复制");
  }, []);

  const copyMessage = useCallback(
    async (message: ChisaTalkMessage) => {
      await Clipboard.setStringAsync(message.content);
      showCopiedFeedback();
    },
    [showCopiedFeedback],
  );

  const openEditMessage = useCallback((message: ChisaTalkMessage) => {
    setEditingMessage(message);
    setEditDraft(message.content);
  }, []);

  const closeEditMessage = useCallback(() => {
    setEditingMessage(null);
    setEditDraft("");
  }, []);

  const submitEditedMessage = useCallback(() => {
    if (!editingMessage) {
      return;
    }
    const content = editDraft.trim();
    if (content.length === 0) {
      Alert.alert("内容不能为空", "请输入要重新生成的问题。");
      return;
    }
    const messageId = editingMessage.id;
    closeEditMessage();
    void onEditLastUserMessage(messageId, content);
  }, [closeEditMessage, editDraft, editingMessage, onEditLastUserMessage]);

  useEffect(() => {
    scrollToLatest(true);
  }, [isSending, messages.length, scrollToLatest, selectedConversation?.id]);

  useEffect(() => {
    if (!isSending) {
      setThinkingFrame(0);
      return;
    }

    const intervalId = setInterval(() => {
      setThinkingFrame((current) => (current + 1) % 3);
    }, 360);

    return () => clearInterval(intervalId);
  }, [isSending]);

  useEffect(() => {
    if (!settingsOpen) {
      setSettingsDraft(assistantProfile);
    }
  }, [assistantProfile, settingsOpen]);

  const activeModel = useMemo(() => {
    if (!selectedConversation?.modelId) {
      return models.find((model) => model.id === selectedModelId) ?? null;
    }
    return models.find((model) => model.id === selectedConversation.modelId) ?? null;
  }, [models, selectedConversation?.modelId, selectedModelId]);
  const userRoleLabel = getMessageRoleLabel({
    role: "user",
    userDisplayName: user.displayName,
    assistantName: assistantProfile.aiName,
  });
  const assistantRoleLabel = getMessageRoleLabel({
    role: "assistant",
    userDisplayName: user.displayName,
    assistantName: assistantProfile.aiName,
  });
  const participantLabels = useMemo(
    () => [userRoleLabel, assistantRoleLabel],
    [assistantRoleLabel, userRoleLabel],
  );
  const visibleConversationTitle = selectedConversation
    ? formatConversationListTitle(selectedConversation.title, participantLabels)
    : assistantRoleLabel;
  const latestUserMessageId = useMemo(() => getLatestUserMessageId(messages), [messages]);
  const messageListData = useMemo(
    () =>
      buildMessageListData(messages, {
        isSending,
        streamingAssistantContent,
        agentProgressText,
      }),
    [agentProgressText, isSending, messages, streamingAssistantContent],
  );

  const openMessageActions = useCallback(
    (message: ChisaTalkMessage) => {
      const actionState = getMessageActionState({
        message,
        latestUserMessageId,
        isSending,
      });
      const buttons: {
        text: string;
        onPress?: () => void;
        style?: "default" | "cancel" | "destructive";
      }[] = [];

      if (actionState.canCopy) {
        buttons.push({ text: "复制", onPress: () => void copyMessage(message) });
      }
      if (actionState.canEditAndRegenerate) {
        buttons.push({ text: "编辑并重答", onPress: () => openEditMessage(message) });
      }
      buttons.push({ text: "取消", style: "cancel" });

      if (buttons.length > 1) {
        Alert.alert("消息操作", undefined, buttons);
      }
    },
    [copyMessage, isSending, latestUserMessageId, openEditMessage],
  );

  const renderPersistedMessage = useCallback(
    (message: ChisaTalkMessage) => {
      const isUser = message.role === "user";
      const roleLabel = getMessageRoleLabel({
        role: message.role,
        userDisplayName: user.displayName,
        assistantName: assistantProfile.aiName,
      });
      const imageAttachments = readMessageImageAttachments(message.providerMeta);
      const reasoning = !isUser ? readMessageReasoning(message.providerMeta) : null;
      const approvalActionState = !isUser
        ? getPendingHermesApprovalActionState({
            providerMeta: message.providerMeta,
            isSending,
          })
        : { canRespond: false };
      const reasoningDisclosure = getReasoningDisclosureState({
        messageId: message.id,
        expandedReasoningIds,
      });

      return (
        <View style={[styles.messageRow, isUser ? styles.userMessageRow : styles.assistantMessageRow]}>
          <AnimatedPressable
            accessibilityRole="button"
            onLongPress={() => openMessageActions(message)}
            staticMotion
            style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}
          >
            <Text style={[styles.roleText, isUser ? styles.userRoleText : styles.assistantRoleText]}>
              {roleLabel}
            </Text>
            {reasoning ? (
              <View style={styles.reasoningCard}>
                <AnimatedPressable
                  accessibilityRole="button"
                  onPress={() => toggleReasoning(message.id)}
                  style={styles.reasoningHeader}
                >
                  <Text style={styles.reasoningTitle}>思考过程</Text>
                  <Text style={styles.reasoningMeta}>{reasoningDisclosure.actionText}</Text>
                </AnimatedPressable>
                <Text numberOfLines={reasoningDisclosure.numberOfLines} style={styles.reasoningBody}>
                  {reasoning}
                </Text>
              </View>
            ) : null}
            {isUser ? (
              <Text style={[styles.messageText, styles.userMessageText]}>{message.content}</Text>
            ) : (
              <MessageContent content={message.content} />
            )}
            {imageAttachments.map((attachment, index) => (
              <Image
                key={`${message.id}-image-${index}`}
                source={{ uri: attachment.dataUrl }}
                style={styles.messageImage}
              />
            ))}
            {approvalActionState.canRespond ? (
              <View style={styles.approvalButtonRow}>
                <AnimatedPressable
                  accessibilityRole="button"
                  onPress={() => void onSendMessage("批准", [])}
                  style={[styles.approvalButton, styles.approvalButtonPrimary]}
                >
                  <Text style={styles.approvalButtonTextPrimary}>批准</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  accessibilityRole="button"
                  onPress={() => void onSendMessage("拒绝", [])}
                  style={[styles.approvalButton, styles.approvalButtonSecondary]}
                >
                  <Text style={styles.approvalButtonTextSecondary}>拒绝</Text>
                </AnimatedPressable>
              </View>
            ) : null}
          </AnimatedPressable>
        </View>
      );
    },
    [
      assistantProfile.aiName,
      expandedReasoningIds,
      isSending,
      onSendMessage,
      openMessageActions,
      toggleReasoning,
      user.displayName,
    ],
  );

  const renderStreamingAssistant = useCallback(
    (item: Extract<MessageListRow<ChisaTalkMessage>, { type: "streaming" }>) => (
      <View style={[styles.messageRow, styles.assistantMessageRow]}>
        <View style={[styles.messageBubble, styles.assistantBubble]}>
          <Text style={[styles.roleText, styles.assistantRoleText]}>{assistantRoleLabel}</Text>
          <View style={styles.reasoningCard}>
            <View style={styles.reasoningHeader}>
              <Text style={styles.reasoningTitle}>{item.agentProgressText ? "Hermes Agent" : "思考中"}</Text>
              <Text style={styles.reasoningMeta}>
                {item.streamingAssistantContent.trim().length > 0 ? "流式回复中" : "等待模型返回"}
              </Text>
            </View>
            <Text style={styles.reasoningBody}>
              {item.agentProgressText ?? "正在组织上下文、图片和历史消息。"}
            </Text>
          </View>
          {item.streamingAssistantContent.trim().length > 0 ? (
            <MessageContent content={item.streamingAssistantContent} />
          ) : (
            <>
              <Text style={styles.thinkingText}>正在生成回复</Text>
              <View style={styles.thinkingDots}>
                {[0, 1, 2].map((index) => (
                  <View
                    key={index}
                    style={[styles.thinkingDot, thinkingFrame === index ? styles.thinkingDotActive : null]}
                  />
                ))}
              </View>
            </>
          )}
        </View>
      </View>
    ),
    [assistantRoleLabel, thinkingFrame],
  );

  const renderMessageListRow = useCallback(
    ({ item }: { item: MessageListRow<ChisaTalkMessage> }) =>
      item.type === "message" ? renderPersistedMessage(item.message) : renderStreamingAssistant(item),
    [renderPersistedMessage, renderStreamingAssistant],
  );

  const composerState = getChatComposerState({
    draft,
    hasActiveEnabledModel: activeModel?.enabled ?? false,
    hasImageAttachment: pendingImage !== null,
    hasSelectedConversation: selectedConversation !== null,
    isLoadingConversation,
    isSending,
  });
  const sendButtonAccessibilityState = getSendButtonAccessibilityState({
    canSend: composerState.canSend,
    isSending,
  });

  const handleSend = () => {
    if (isSending) {
      onStopSending();
      return;
    }
    if (!composerState.canSend) {
      return;
    }
    const content = draft.trim() || "请分析这张图片";
    const attachments = pendingImage ? [pendingImage] : [];
    setDraft("");
    void onSendMessage(content, attachments);
  };

  const sidebarTranslateX = sidebarProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-380, 0],
  });
  const sidebarBackdropOpacity = sidebarProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const sidebarScale = sidebarProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.985, 1],
  });
  const sidebarOpacity = sidebarProgress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0.72, 1],
  });

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar
        barStyle={theme.colorScheme === "dark" ? "light-content" : "dark-content"}
        backgroundColor={theme.colors.statusBar}
      />
      <View style={styles.topBar}>
        <AnimatedPressable accessibilityRole="button" onPress={openSidebar} style={styles.iconButton}>
          <Menu size={20} color={theme.colors.foreground} />
        </AnimatedPressable>
        <View style={styles.titleBlock}>
          <Text style={styles.appName} numberOfLines={1}>
            {visibleConversationTitle}
          </Text>
          <Text style={styles.subText} numberOfLines={1}>
            {activeModel ? modelTitle(activeModel) : "Hermes Agent"}
          </Text>
        </View>
        <AnimatedPressable accessibilityRole="button" onPress={() => void onRefresh()} style={styles.iconButton}>
          <RefreshCw size={18} color={theme.colors.foreground} />
        </AnimatedPressable>
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.body}
      >
        {selectedConversation ? (
          <FlatList
            contentContainerStyle={styles.messagesContent}
            data={messageListData}
            initialNumToRender={getMessageListInitialRenderCount(messages.length)}
            keyExtractor={(item) => item.id}
            maxToRenderPerBatch={12}
            onContentSizeChange={() => scrollToLatest(true)}
            ref={messagesScrollRef}
            removeClippedSubviews={Platform.OS === "android"}
            renderItem={renderMessageListRow}
            showsVerticalScrollIndicator={false}
            style={styles.messages}
            windowSize={7}
          />
        ) : (
          <View style={styles.emptyMain}>
            <View style={styles.emptyMark}>
              <Text style={styles.emptyMarkText}>CT</Text>
            </View>
            <Text style={styles.emptyTitle}>还没有会话</Text>
            <Text style={styles.emptyBody}>直接发送第一条消息，系统会自动创建 Hermes 会话。</Text>
            <AnimatedPressable
              accessibilityRole="button"
              disabled={!activeModel?.enabled}
              onPress={() => void onCreateConversation()}
              style={[styles.emptyActionButton, !activeModel?.enabled ? styles.sendButtonDisabled : null]}
            >
              <Plus size={16} color={theme.colors.accentForeground} />
              <Text style={styles.emptyActionText}>新建会话</Text>
            </AnimatedPressable>
          </View>
        )}

        <View style={styles.composerStack}>
          {pendingImage ? (
            <View style={styles.imagePreviewRow}>
              <View>
                <Image source={{ uri: pendingImage.dataUrl }} style={styles.imagePreview} />
                <AnimatedPressable accessibilityRole="button" onPress={onClearImage} style={styles.removeImageButton}>
                  <X size={16} color="#ffffff" />
                </AnimatedPressable>
              </View>
            </View>
          ) : null}
          <View style={styles.composer}>
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isSending || isPickingImage }}
              disabled={isSending || isPickingImage}
              onPress={() => void onPickImage()}
              style={[styles.attachButton, isPickingImage ? styles.sendButtonDisabled : null]}
            >
              <ImagePlus size={19} color={theme.colors.foreground} />
            </AnimatedPressable>
            <TextInput
              editable={composerState.editable}
              multiline={isDraftMultiline}
              onChangeText={setDraft}
              onSubmitEditing={handleSend}
              placeholder={activeModel?.enabled ? "输入消息" : "Hermes Agent 不可用"}
              placeholderTextColor={theme.colors.foregroundMuted}
              style={[styles.input, isDraftMultiline ? styles.inputMultiline : styles.inputSingleLine]}
              value={draft}
            />
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityState={sendButtonAccessibilityState}
              disabled={!isSending && !composerState.canSend}
              onPress={handleSend}
              style={[styles.sendButton, !isSending && !composerState.canSend ? styles.sendButtonDisabled : null]}
            >
              {isSending ? (
                <Square size={17} color={theme.colors.accentForeground} fill={theme.colors.accentForeground} />
              ) : (
                <Send size={18} color={theme.colors.accentForeground} />
              )}
            </AnimatedPressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {sidebarOpen ? (
        <>
          <Animated.View style={[styles.sidebarBackdrop, { opacity: sidebarBackdropOpacity }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭侧边栏"
              onPress={closeSidebar}
              style={styles.backdropPressable}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.sidebar,
              {
                opacity: sidebarOpacity,
                transform: [{ translateX: sidebarTranslateX }, { scale: sidebarScale }],
              },
            ]}
          >
            <View style={styles.sidebarHeader}>
              <View style={styles.sidebarBrandRow}>
                <View style={styles.sidebarMark}>
                  <Text style={styles.sidebarMarkText}>CT</Text>
                </View>
                <View>
                  <Text style={styles.sidebarTitle}>ChisaTalk</Text>
                  <Text style={styles.userText}>已登录：{user.displayName}</Text>
                </View>
              </View>
              <AnimatedPressable accessibilityRole="button" onPress={closeSidebar} style={styles.iconButton}>
                <X size={18} color={theme.colors.foreground} />
              </AnimatedPressable>
            </View>

            <View style={styles.actionStack}>
              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => {
                  closeSidebar();
                  void onCreateConversation();
                }}
                style={[styles.actionButton, styles.actionButtonPrimary]}
              >
                <Plus size={16} color={theme.colors.accentForeground} />
                <Text style={[styles.actionText, styles.actionTextPrimary]}>新建会话</Text>
              </AnimatedPressable>
              <AnimatedPressable
                accessibilityRole="button"
                onPress={openSettings}
                style={styles.actionButton}
              >
                <Settings size={16} color={theme.colors.foreground} />
                <Text style={styles.actionText}>人设设置</Text>
              </AnimatedPressable>
              <View style={styles.secondaryActionRow}>
                <AnimatedPressable
                  accessibilityRole="button"
                  onPress={() => void onRefresh()}
                  style={[styles.actionButton, styles.secondaryActionButton]}
                >
                  <RefreshCw size={16} color={theme.colors.foreground} />
                  <Text style={styles.actionText}>{isRefreshing ? "刷新中" : "刷新"}</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  accessibilityRole="button"
                  onPress={() => void onLogout()}
                  style={[styles.actionButton, styles.secondaryActionButton]}
                >
                  <LogOut size={16} color={theme.colors.foreground} />
                  <Text style={styles.actionText}>退出</Text>
                </AnimatedPressable>
              </View>
            </View>

            {settingsOpen ? (
              <>
                <Text style={styles.sectionLabel}>人设</Text>
                <ScrollView contentContainerStyle={styles.settingsContent} style={styles.settingsScroll}>
                  <View style={styles.settingsPanel}>
                    {getAssistantProfileFields().map((field) => (
                      <View key={field.key} style={styles.settingsField}>
                        <Text style={styles.settingsLabel}>{field.label}</Text>
                        <TextInput
                          multiline={field.multiline}
                          onChangeText={(value) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              [field.key]: value,
                            }))
                          }
                          placeholder={field.placeholder}
                          placeholderTextColor={theme.colors.foregroundMuted}
                          style={[
                            styles.settingsInput,
                            field.multiline ? styles.settingsTextArea : null,
                          ]}
                          value={settingsDraft[field.key]}
                        />
                      </View>
                    ))}
                    <Text style={styles.settingsHint}>
                      保存后会用于下一次发送消息的系统提示，不会改写历史会话。
                    </Text>
                    <View style={styles.settingsButtonRow}>
                      <AnimatedPressable
                        accessibilityRole="button"
                        disabled={isSavingSettings}
                        onPress={closeSettings}
                        style={[styles.actionButton, styles.secondaryActionButton]}
                      >
                        <Text style={styles.actionText}>取消</Text>
                      </AnimatedPressable>
                      <AnimatedPressable
                        accessibilityRole="button"
                        accessibilityState={{ busy: isSavingSettings, disabled: isSavingSettings }}
                        disabled={isSavingSettings}
                        onPress={() => void saveSettings()}
                        style={[
                          styles.actionButton,
                          styles.actionButtonPrimary,
                          styles.settingsSaveButton,
                          isSavingSettings ? styles.sendButtonDisabled : null,
                        ]}
                      >
                        <Text style={[styles.actionText, styles.actionTextPrimary]}>
                          {isSavingSettings ? "保存中" : "保存"}
                        </Text>
                      </AnimatedPressable>
                    </View>
                  </View>
                </ScrollView>
              </>
            ) : (
              <>
                <Text style={styles.sectionLabel}>会话</Text>
                <ScrollView contentContainerStyle={styles.conversationList} style={styles.conversationScroll}>
                  {conversations.length === 0 ? (
                    <Text style={styles.emptySidebar}>暂无历史会话。</Text>
                  ) : (
                    conversations.map((conversation) => (
                      <AnimatedPressable
                        accessibilityRole="button"
                        accessibilityHint="长按删除会话"
                        key={conversation.id}
                        onLongPress={() => confirmDeleteConversation(conversation)}
                        onPress={() => {
                          closeSidebar();
                          void onSelectConversation(conversation.id);
                        }}
                        style={[
                          styles.conversationItem,
                          selectedConversation?.id === conversation.id ? styles.conversationItemActive : null,
                        ]}
                      >
                        <Text style={styles.conversationTitle} numberOfLines={1}>
                          {formatConversationListTitle(conversation.title, participantLabels)}
                        </Text>
                        <Text style={styles.conversationTime}>{formatTime(conversation.updatedAt)}</Text>
                      </AnimatedPressable>
                    ))
                  )}
                </ScrollView>
              </>
            )}
          </Animated.View>
        </>
      ) : null}
      <Modal
        animationType="fade"
        onRequestClose={closeEditMessage}
        transparent
        visible={editingMessage !== null}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.editPanel}>
            <Text style={styles.editTitle}>修改问题</Text>
            <TextInput
              autoFocus
              multiline
              onChangeText={setEditDraft}
              placeholder="输入新的问题"
              placeholderTextColor={theme.colors.foregroundMuted}
              style={styles.editInput}
              value={editDraft}
            />
            <View style={styles.editButtonRow}>
              <AnimatedPressable
                accessibilityRole="button"
                onPress={closeEditMessage}
                style={[styles.actionButton, styles.secondaryActionButton, styles.editCancelButton]}
              >
                <Text style={styles.actionText}>取消</Text>
              </AnimatedPressable>
              <AnimatedPressable
                accessibilityRole="button"
                onPress={submitEditedMessage}
                style={[
                  styles.actionButton,
                  styles.actionButtonPrimary,
                  styles.editSubmitButton,
                  editDraft.trim().length === 0 ? styles.sendButtonDisabled : null,
                ]}
              >
                <Text style={[styles.actionText, styles.actionTextPrimary]}>重新生成</Text>
              </AnimatedPressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
