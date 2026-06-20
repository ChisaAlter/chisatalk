import type { AssistantProfile } from "@/settings/assistant-profile";

export interface AssistantProfileField {
  key: keyof AssistantProfile;
  label: string;
  placeholder: string;
  multiline: boolean;
}

export function getAssistantProfileFields(): AssistantProfileField[] {
  return [
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
      placeholder: "例如：冷静、直接，但会照顾用户情绪",
      multiline: true,
    },
    {
      key: "persona",
      label: "人设",
      placeholder: "例如：鸣潮风格的私人 AI 助手",
      multiline: true,
    },
  ];
}
