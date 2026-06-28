export type MessageListMessage = {
  id: string;
  role: string;
  content: string;
};

export type MessageListRow<TMessage extends MessageListMessage = MessageListMessage> =
  | {
      type: "message";
      id: string;
      message: TMessage;
    }
  | {
      type: "streaming";
      id: "streaming-assistant";
      streamingAssistantContent: string;
      agentProgressText: string | null;
    };

export function buildMessageListData<TMessage extends MessageListMessage>(
  messages: TMessage[],
  streaming?: {
    isSending: boolean;
    streamingAssistantContent: string;
    agentProgressText: string | null;
  },
): MessageListRow<TMessage>[] {
  const rows: MessageListRow<TMessage>[] = messages.map((message) => ({
    type: "message",
    id: message.id,
    message,
  }));

  if (streaming?.isSending) {
    rows.push({
      type: "streaming",
      id: "streaming-assistant",
      streamingAssistantContent: streaming.streamingAssistantContent,
      agentProgressText: streaming.agentProgressText,
    });
  }

  return rows;
}

export function getMessageListInitialRenderCount(messageCount: number): number {
  return Math.min(Math.max(messageCount, 4), 16);
}
