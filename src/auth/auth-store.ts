import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { ChisaTalkUser } from "@/api/chisatalk-client";

const AUTH_STORAGE_KEY = "chisatalk.auth.v1";

export interface AuthSession {
  accessToken: string;
  user: ChisaTalkUser;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function parseStoredSession(value: unknown): AuthSession | null {
  if (!isRecord(value) || !isRecord(value.user)) {
    return null;
  }

  const accessToken = readString(value, "accessToken");
  const id = readString(value.user, "id");
  const username = readString(value.user, "username");
  const displayName = readString(value.user, "displayName");

  if (!accessToken || !id || !username || !displayName) {
    return null;
  }

  return {
    accessToken,
    user: { id, username, displayName },
  };
}

export async function loadAuthSession(): Promise<AuthSession | null> {
  const stored = await SecureStore.getItemAsync(AUTH_STORAGE_KEY);
  if (!stored) {
    const legacyStored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (!legacyStored) {
      return null;
    }
    try {
      const migratedSession = parseStoredSession(JSON.parse(legacyStored) as unknown);
      if (migratedSession) {
        await saveAuthSession(migratedSession);
      } else {
        await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      }
      return migratedSession;
    } catch (error) {
      console.error("[AuthStore] Failed to parse legacy auth session", error);
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
  }

  try {
    return parseStoredSession(JSON.parse(stored) as unknown);
  } catch (error) {
    console.error("[AuthStore] Failed to parse stored auth session", error);
    await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
    return null;
  }
}

export async function saveAuthSession(session: AuthSession): Promise<void> {
  await SecureStore.setItemAsync(AUTH_STORAGE_KEY, JSON.stringify(session));
  await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
}

export async function clearAuthSession(): Promise<void> {
  await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
  await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
}
