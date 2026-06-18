import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { clearAuthSession, loadAuthSession, saveAuthSession } from "./auth-store";

vi.mock("@react-native-async-storage/async-storage", () => {
  return {
    default: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
  };
});

vi.mock("expo-secure-store", () => {
  return {
    getItemAsync: vi.fn(),
    setItemAsync: vi.fn(),
    deleteItemAsync: vi.fn(),
  };
});

describe("auth-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores auth sessions in SecureStore and clears legacy AsyncStorage copies", async () => {
    const session = {
      accessToken: "token-123",
      user: { id: "u1", username: "Ayase", displayName: "Ayase" },
    };

    await saveAuthSession(session);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "chisatalk.auth.v1",
      JSON.stringify(session),
    );
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("chisatalk.auth.v1");
  });

  it("migrates a valid legacy AsyncStorage session into SecureStore", async () => {
    const session = {
      accessToken: "token-legacy",
      user: { id: "u1", username: "Ayase", displayName: "Ayase" },
    };
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify(session));

    await expect(loadAuthSession()).resolves.toEqual(session);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "chisatalk.auth.v1",
      JSON.stringify(session),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("chisatalk.auth.v1");
  });

  it("clears sessions from both storage backends", async () => {
    await clearAuthSession();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("chisatalk.auth.v1");
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("chisatalk.auth.v1");
  });
});
