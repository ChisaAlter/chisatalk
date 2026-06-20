import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import {
  ChisaTalkApiError,
  createChatCompletion,
  createConversation,
  getConversation,
  getCurrentUser,
  getModels,
  listConversations,
  login,
  updateConversation,
} from "@/api/chisatalk-client";
import type {
  ChisaTalkConversation,
  ChisaTalkImageAttachment,
  ChisaTalkMessage,
  ChisaTalkModel,
  JsonValue,
} from "@/api/chisatalk-client";
import { buildAgentProviderMeta, streamAgentTurn } from "@/api/agent-turn-stream";
import { pickChatImageAttachment } from "@/api/chat-image-picker";
import {
  clearAuthSession,
  loadAuthSession,
  saveAuthSession,
  type AuthSession,
} from "@/auth/auth-store";
import { LoginScreen } from "@/screens/login-screen";
import { ChatScreen } from "@/screens/chat-screen";
import {
  buildAssistantProfileSystemPrompt,
  DEFAULT_ASSISTANT_PROFILE,
  loadAssistantProfile,
  saveAssistantProfile,
  type AssistantProfile,
} from "@/settings/assistant-profile";

type BootState = "loading" | "ready";

const styles = StyleSheet.create((theme) => ({
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[4],
    backgroundColor: theme.colors.surface0,
    padding: theme.spacing[6],
  },
  loadingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));

function getReadableError(error: unknown): string {
  if (error instanceof ChisaTalkApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败";
}

function isRequestCancelled(error: unknown): boolean {
  return error instanceof Error && error.message === "Hermes Agent 请求已取消";
}

function createClientMessageId(): string {
  return `client_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatAgentProgress(value: JsonValue): string {
  if (!isRecord(value)) {
    return "Hermes Agent 正在调用工具";
  }
  const message = typeof value.message === "string" ? value.message.trim() : "";
  const toolName = typeof value.toolName === "string" ? value.toolName.trim() : "";
  const status = typeof value.status === "string" ? value.status.trim() : "";

  if (message.length > 0) {
    return message;
  }
  if (toolName.length > 0 && status.length > 0) {
    return `${toolName}：${status}`;
  }
  if (toolName.length > 0) {
    return `正在使用 ${toolName}`;
  }
  return "Hermes Agent 正在调用工具";
}

function moveConversationToTop(
  conversations: ChisaTalkConversation[],
  nextConversation: ChisaTalkConversation,
): ChisaTalkConversation[] {
  return [
    nextConversation,
    ...conversations.filter((conversation) => conversation.id !== nextConversation.id),
  ];
}

function getDefaultModelId(models: ChisaTalkModel[]): string | null {
  return (
    models.find((model) => model.enabled && model.providerType === "hermes-agent")?.id ??
    models.find((model) => model.enabled)?.id ??
    null
  );
}

function replaceMessageAndDropFollowing(
  messages: ChisaTalkMessage[],
  nextMessage: ChisaTalkMessage,
): ChisaTalkMessage[] {
  const index = messages.findIndex((message) => message.id === nextMessage.id);
  if (index === -1) {
    return [...messages, nextMessage];
  }
  return [...messages.slice(0, index), nextMessage];
}

function appendOrReplaceMessage(
  messages: ChisaTalkMessage[],
  nextMessage: ChisaTalkMessage,
): ChisaTalkMessage[] {
  const index = messages.findIndex((message) => message.id === nextMessage.id);
  if (index === -1) {
    return [...messages, nextMessage];
  }
  const nextMessages = [...messages];
  nextMessages[index] = nextMessage;
  return nextMessages;
}

export default function Index() {
  const { theme } = useUnistyles();
  const [bootState, setBootState] = useState<BootState>("loading");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [models, setModels] = useState<ChisaTalkModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ChisaTalkConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ChisaTalkConversation | null>(null);
  const [messages, setMessages] = useState<ChisaTalkMessage[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [pendingImage, setPendingImage] = useState<ChisaTalkImageAttachment | null>(null);
  const [streamingAssistantContent, setStreamingAssistantContent] = useState("");
  const [agentProgressText, setAgentProgressText] = useState<string | null>(null);
  const activeSendAbortRef = useRef<AbortController | null>(null);
  const activeSendIdRef = useRef(0);
  const [assistantProfile, setAssistantProfile] = useState<AssistantProfile>(DEFAULT_ASSISTANT_PROFILE);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const endSession = useCallback(async () => {
    await clearAuthSession();
    setSession(null);
    setModels([]);
    setSelectedModelId(null);
    setConversations([]);
    setSelectedConversation(null);
    setMessages([]);
    setChatError(null);
    setPendingImage(null);
    setStreamingAssistantContent("");
    setAgentProgressText(null);
  }, []);

  const handleAuthError = useCallback(
    async (error: unknown): Promise<boolean> => {
      if (error instanceof ChisaTalkApiError && error.status === 401) {
        await endSession();
        setLoginError("登录已失效，请重新登录");
        return true;
      }
      return false;
    },
    [endSession],
  );

  const loadConversationDetail = useCallback(
    async (activeSession: AuthSession, conversationId: string) => {
      setIsLoadingConversation(true);
      setChatError(null);
      try {
        const detail = await getConversation(activeSession.accessToken, conversationId);
        setSelectedConversation(detail.conversation);
        setMessages(detail.messages);
        setStreamingAssistantContent("");
        setAgentProgressText(null);
      } catch (error) {
        console.error("[ChisaTalk] Failed to load conversation", error);
        if (!(await handleAuthError(error))) {
          setChatError(getReadableError(error));
        }
      } finally {
        setIsLoadingConversation(false);
      }
    },
    [handleAuthError],
  );

  const refreshWorkspace = useCallback(
    async (activeSession: AuthSession, preferredConversationId?: string) => {
      setIsRefreshing(true);
      setChatError(null);
      try {
        const nextUser = await getCurrentUser(activeSession.accessToken);
        const nextModels = await getModels(activeSession.accessToken);
        const nextConversations = await listConversations(activeSession.accessToken, { limit: 50 });
        const nextSession = { accessToken: activeSession.accessToken, user: nextUser };

        setSession(nextSession);
        setModels(nextModels);
        setConversations(nextConversations.items);
        await saveAuthSession(nextSession);

        setSelectedModelId(getDefaultModelId(nextModels));

        const nextSelectedId = preferredConversationId ?? selectedConversation?.id ?? nextConversations.items[0]?.id;
        if (nextSelectedId) {
          await loadConversationDetail(nextSession, nextSelectedId);
        } else {
          setSelectedConversation(null);
          setMessages([]);
          setStreamingAssistantContent("");
          setAgentProgressText(null);
        }
      } catch (error) {
        console.error("[ChisaTalk] Failed to refresh workspace", error);
        if (!(await handleAuthError(error))) {
          setChatError(getReadableError(error));
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [handleAuthError, loadConversationDetail, selectedConversation?.id],
  );

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const storedSession = await loadAuthSession();
        if (cancelled) {
          return;
        }
        if (storedSession) {
          setSession(storedSession);
          await refreshWorkspace(storedSession);
        }
        const storedAssistantProfile = await loadAssistantProfile();
        if (!cancelled) {
          setAssistantProfile(storedAssistantProfile);
        }
      } catch (error) {
        console.error("[ChisaTalk] Boot failed", error);
        if (!cancelled) {
          setLoginError(getReadableError(error));
        }
      } finally {
        if (!cancelled) {
          setBootState("ready");
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [refreshWorkspace]);

  const handleLogin = useCallback(
    async (input: { username: string; password: string }) => {
      setIsLoggingIn(true);
      setLoginError(null);
      try {
        const result = await login(input);
        const nextSession = { accessToken: result.accessToken, user: result.user };
        await saveAuthSession(nextSession);
        setSession(nextSession);
        await refreshWorkspace(nextSession);
      } catch (error) {
        console.error("[ChisaTalk] Login failed", error);
        setLoginError(getReadableError(error));
      } finally {
        setIsLoggingIn(false);
      }
    },
    [refreshWorkspace],
  );

  const handleRefresh = useCallback(async () => {
    if (!session) {
      return;
    }
    await refreshWorkspace(session);
  }, [refreshWorkspace, session]);

  const handleLogout = useCallback(async () => {
    await endSession();
  }, [endSession]);

  const handleCreateConversation = useCallback(async () => {
    if (!session) {
      return;
    }
    const modelId = getDefaultModelId(models);
    if (!modelId) {
      setChatError("Hermes Agent 暂不可用");
      return;
    }

    setChatError(null);
    try {
      const conversation = await createConversation(session.accessToken, {
        title: "新的会话",
        modelId,
      });
      setConversations((current) => [conversation, ...current]);
      setSelectedConversation(conversation);
      setMessages([]);
      setStreamingAssistantContent("");
      setAgentProgressText(null);
    } catch (error) {
      console.error("[ChisaTalk] Failed to create conversation", error);
      if (!(await handleAuthError(error))) {
        setChatError(getReadableError(error));
      }
    }
  }, [handleAuthError, models, session]);

  const handleSelectConversation = useCallback(
    async (conversationId: string) => {
      if (!session) {
        return;
      }
      await loadConversationDetail(session, conversationId);
    },
    [loadConversationDetail, session],
  );

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      if (!session) {
        return;
      }

      setChatError(null);
      try {
        await updateConversation(session.accessToken, conversationId, { archived: true });
        const remainingConversations = conversations.filter((conversation) => conversation.id !== conversationId);
        setConversations(remainingConversations);

        if (selectedConversation?.id !== conversationId) {
          return;
        }

        const nextConversationId = remainingConversations[0]?.id;
        if (nextConversationId) {
          await loadConversationDetail(session, nextConversationId);
          return;
        }

        setSelectedConversation(null);
        setMessages([]);
        setStreamingAssistantContent("");
        setAgentProgressText(null);
      } catch (error) {
        console.error("[ChisaTalk] Failed to delete conversation", error);
        if (!(await handleAuthError(error))) {
          setChatError(getReadableError(error));
        }
      }
    },
    [conversations, handleAuthError, loadConversationDetail, selectedConversation?.id, session],
  );

  const handlePickImage = useCallback(async () => {
    setIsPickingImage(true);
    setChatError(null);
    try {
      const attachment = await pickChatImageAttachment();
      if (attachment) {
        setPendingImage(attachment);
      }
    } catch (error) {
      console.error("[ChisaTalk] Failed to pick image", error);
      setChatError(getReadableError(error));
    } finally {
      setIsPickingImage(false);
    }
  }, []);

  const handleSaveAssistantProfile = useCallback(async (profile: AssistantProfile) => {
    const savedProfile = await saveAssistantProfile(profile);
    setAssistantProfile(savedProfile);
  }, []);

  const handleSendMessage = useCallback(
    async (content: string, attachments: ChisaTalkImageAttachment[], editMessageId?: string) => {
      if (!session) {
        return;
      }
      if (editMessageId && !selectedConversation) {
        setChatError("只能修改当前会话的最后一条消息");
        return;
      }

      const modelId = selectedConversation?.modelId ?? getDefaultModelId(models);
      if (!modelId) {
        setChatError("Hermes Agent 暂不可用");
        return;
      }

      const model = models.find((item) => item.id === modelId);
      if (!model) {
        setChatError("当前模型配置不存在");
        return;
      }

      activeSendAbortRef.current?.abort();
      const sendId = activeSendIdRef.current + 1;
      activeSendIdRef.current = sendId;
      const abortController = new AbortController();
      activeSendAbortRef.current = abortController;
      const isCurrentSend = () =>
        activeSendIdRef.current === sendId && !abortController.signal.aborted;

      setIsSending(true);
      setChatError(null);
      setPendingImage(null);
      setStreamingAssistantContent("");
      setAgentProgressText(null);

      try {
        const activeConversation =
          selectedConversation ??
          (await createConversation(session.accessToken, {
            title: content.slice(0, 32) || "新的会话",
            modelId,
          }));

        if (!selectedConversation) {
          setSelectedConversation(activeConversation);
          setMessages([]);
          setConversations((current) => [activeConversation, ...current]);
        }

        if (model.providerType === "hermes-agent") {
          let streamError: string | null = null;
          await streamAgentTurn({
            accessToken: session.accessToken,
            conversationId: activeConversation.id,
            signal: abortController.signal,
            input: {
              content,
              modelId,
              clientMessageId: createClientMessageId(),
              editMessageId,
              providerMeta: buildAgentProviderMeta(attachments),
              systemPrompt: buildAssistantProfileSystemPrompt(assistantProfile),
            },
            onEvent: (event) => {
              if (!isCurrentSend()) {
                return;
              }
              if (event.type === "user_message") {
                setMessages((current) => {
                  if (editMessageId) {
                    return replaceMessageAndDropFollowing(current, event.message);
                  }
                  return appendOrReplaceMessage(current, event.message);
                });
                setSelectedConversation(event.conversation);
                setConversations((current) => moveConversationToTop(current, event.conversation));
                return;
              }
              if (event.type === "assistant_delta") {
                setStreamingAssistantContent((current) => `${current}${event.delta}`);
                return;
              }
              if (event.type === "tool_progress") {
                setAgentProgressText(formatAgentProgress(event.data));
                return;
              }
              if (event.type === "assistant_message") {
                setMessages((current) => appendOrReplaceMessage(current, event.message));
                setStreamingAssistantContent("");
                setAgentProgressText(null);
                setSelectedConversation(event.conversation);
                setConversations((current) => moveConversationToTop(current, event.conversation));
                return;
              }
              if (event.type === "error") {
                streamError = event.message;
              }
            },
          });
          if (streamError) {
            throw new Error(streamError);
          }
          return;
        }

        const completion = await createChatCompletion(session.accessToken, activeConversation.id, {
          content,
          modelId,
          clientMessageId: createClientMessageId(),
          editMessageId,
          providerMeta: buildAgentProviderMeta(attachments),
          systemPrompt: buildAssistantProfileSystemPrompt(assistantProfile),
        }, undefined, abortController.signal);
        if (isCurrentSend()) {
          setMessages((current) => {
            if (!editMessageId) {
              return [...current, completion.userMessage, completion.assistantMessage];
            }
            return [
              ...replaceMessageAndDropFollowing(current, completion.userMessage),
              completion.assistantMessage,
            ];
          });
          setSelectedConversation(completion.conversation);
          setConversations((current) => moveConversationToTop(current, completion.conversation));
        }
      } catch (error) {
        if (isRequestCancelled(error)) {
          return;
        }
        console.error("[ChisaTalk] Failed to send message", error);
        if (!(await handleAuthError(error))) {
          setChatError(getReadableError(error));
        }
      } finally {
        if (activeSendIdRef.current === sendId) {
          activeSendAbortRef.current = null;
          setIsSending(false);
          setStreamingAssistantContent("");
          setAgentProgressText(null);
        }
      }
    },
    [
      handleAuthError,
      assistantProfile,
      models,
      selectedConversation,
      session,
    ],
  );

  const handleEditLastUserMessage = useCallback(
    async (messageId: string, content: string) => {
      await handleSendMessage(content, [], messageId);
    },
    [handleSendMessage],
  );

  if (bootState === "loading") {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.loadingText}>正在连接 ChisaTalk</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <LoginScreen
        errorMessage={loginError}
        isSubmitting={isLoggingIn}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <ChatScreen
      user={session.user}
      models={models}
      selectedModelId={selectedModelId}
      conversations={conversations}
      selectedConversation={selectedConversation}
      messages={messages}
      errorMessage={chatError}
      isRefreshing={isRefreshing}
      isLoadingConversation={isLoadingConversation}
      isPickingImage={isPickingImage}
      isSending={isSending}
      pendingImage={pendingImage}
      streamingAssistantContent={streamingAssistantContent}
      agentProgressText={agentProgressText}
      assistantProfile={assistantProfile}
      onRefresh={handleRefresh}
      onLogout={handleLogout}
      onCreateConversation={handleCreateConversation}
      onSelectConversation={handleSelectConversation}
      onDeleteConversation={handleDeleteConversation}
      onPickImage={handlePickImage}
      onClearImage={() => setPendingImage(null)}
      onSaveAssistantProfile={handleSaveAssistantProfile}
      onSendMessage={handleSendMessage}
      onEditLastUserMessage={handleEditLastUserMessage}
    />
  );
}
