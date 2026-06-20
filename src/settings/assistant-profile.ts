import AsyncStorage from "@react-native-async-storage/async-storage";

const ASSISTANT_PROFILE_STORAGE_KEY = "chisatalk.assistantProfile.v1";

export interface AssistantProfile {
  aiName: string;
  personality: string;
  persona: string;
  userAddress: string;
}

export const DEFAULT_ASSISTANT_PROFILE: AssistantProfile = {
  aiName: "ChisaTalk",
  personality: "",
  persona: "",
  userAddress: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function normalizeProfile(input: AssistantProfile): AssistantProfile {
  return {
    aiName: input.aiName.trim(),
    personality: input.personality.trim(),
    persona: input.persona.trim(),
    userAddress: input.userAddress.trim(),
  };
}

function parseStoredProfile(value: unknown): AssistantProfile {
  if (!isRecord(value)) {
    return DEFAULT_ASSISTANT_PROFILE;
  }

  return normalizeProfile({
    aiName: readString(value, "aiName") || DEFAULT_ASSISTANT_PROFILE.aiName,
    personality: readString(value, "personality"),
    persona: readString(value, "persona"),
    userAddress: readString(value, "userAddress"),
  });
}

export async function loadAssistantProfile(): Promise<AssistantProfile> {
  const stored = await AsyncStorage.getItem(ASSISTANT_PROFILE_STORAGE_KEY);
  if (!stored) {
    return DEFAULT_ASSISTANT_PROFILE;
  }

  try {
    return parseStoredProfile(JSON.parse(stored) as unknown);
  } catch (error) {
    console.error("[AssistantProfile] Failed to parse stored profile", error);
    await AsyncStorage.removeItem(ASSISTANT_PROFILE_STORAGE_KEY);
    return DEFAULT_ASSISTANT_PROFILE;
  }
}

export async function saveAssistantProfile(profile: AssistantProfile): Promise<AssistantProfile> {
  const normalized = normalizeProfile({
    ...profile,
    aiName: profile.aiName.trim() || DEFAULT_ASSISTANT_PROFILE.aiName,
  });
  await AsyncStorage.setItem(ASSISTANT_PROFILE_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function buildAssistantProfileSystemPrompt(profile: AssistantProfile): string {
  const normalized = normalizeProfile({
    ...profile,
    aiName: profile.aiName.trim() || DEFAULT_ASSISTANT_PROFILE.aiName,
  });
  const lines = [
    `你的姓名是${normalized.aiName}。`,
    normalized.userAddress ? `你对用户的称呼是：${normalized.userAddress}。` : null,
    normalized.personality ? `你的性格：${normalized.personality}` : null,
    normalized.persona ? `你的人设：${normalized.persona}` : null,
    "除非用户要求更改这些设定，否则始终保持以上姓名、称呼、性格和人设。",
    "回答可以使用 Markdown；如果需要表格，请使用普通 Markdown 表格，不要把表格放进代码块。",
  ];

  return lines.filter((line): line is string => Boolean(line)).join("\n");
}
