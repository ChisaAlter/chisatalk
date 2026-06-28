import { describe, expect, it } from "vitest";
import { DEFAULT_CHISATALK_API_BASE_URL, normalizeApiBaseUrl } from "./api-base-url";

describe("api base url configuration", () => {
  it("uses the documented default server URL", () => {
    expect(DEFAULT_CHISATALK_API_BASE_URL).toBe("http://38.76.185.154:8789");
  });

  it("trims trailing slashes from configured URLs", () => {
    expect(normalizeApiBaseUrl("https://example.test///")).toBe("https://example.test");
  });
});
