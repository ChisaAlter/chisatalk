import { REMOTE_CHISATALK_SETUP_EN_US } from "./en-US";
import { REMOTE_CHISATALK_SETUP_ZH_CN } from "./zh-CN";
import type { RemoteChisaTalkSetupI18n } from "./types";

const DEFAULT_LOCALE = "zh-CN";

const REMOTE_CHISATALK_SETUP_I18N_MAP: Record<string, RemoteChisaTalkSetupI18n> = {
  "zh-CN": REMOTE_CHISATALK_SETUP_ZH_CN,
  "en-US": REMOTE_CHISATALK_SETUP_EN_US
};

function normalizeLocale(locale?: string): string {
  const value = (locale || "").trim();
  if (!value) {
    return DEFAULT_LOCALE;
  }

  const lower = value.toLowerCase();
  if (lower.startsWith("zh")) {
    return "zh-CN";
  }
  if (lower.startsWith("en")) {
    return "en-US";
  }

  return value;
}

export function resolveRemoteChisaTalkSetupI18n(locale?: string): RemoteChisaTalkSetupI18n {
  const normalized = normalizeLocale(locale);
  return REMOTE_CHISATALK_SETUP_I18N_MAP[normalized] || REMOTE_CHISATALK_SETUP_I18N_MAP[DEFAULT_LOCALE];
}

export type { RemoteChisaTalkSetupI18n } from "./types";
