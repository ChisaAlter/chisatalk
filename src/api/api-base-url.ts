declare const process:
  | {
      env?: {
        EXPO_PUBLIC_CHISATALK_API_BASE_URL?: string;
      };
    }
  | undefined;

export const DEFAULT_CHISATALK_API_BASE_URL = "http://38.76.185.154:8789";

export function normalizeApiBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function readApiBaseUrl(): string {
  const configured = process?.env?.EXPO_PUBLIC_CHISATALK_API_BASE_URL?.trim();
  return normalizeApiBaseUrl(
    configured && configured.length > 0 ? configured : DEFAULT_CHISATALK_API_BASE_URL,
  );
}

export const CHISATALK_API_BASE_URL = readApiBaseUrl();
