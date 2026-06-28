import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readRuntimeConfig } from "./lib/config.mjs";
import { selectAll, selectOne } from "./lib/database.mjs";
import { sanitizeModel, sanitizeModelsConfig } from "./lib/models.mjs";
import { findGitHubRepoRefs } from "./lib/github-lookup.mjs";

describe("server module boundaries", () => {
  it("parses runtime config from a focused config module", () => {
    const config = readRuntimeConfig({
      CHISATALK_DATABASE_PATH: "/tmp/chisatalk.sqlite",
      CHISATALK_MODELS_PATH: "/tmp/models.json",
      CHISATALK_SESSION_SECRET: "secret",
      CHISATALK_USERS_JSON: JSON.stringify([
        { username: "ayase", password: "secret", displayName: "Ayase" },
      ]),
    });

    assert.equal(config.databasePath, "/tmp/chisatalk.sqlite");
    assert.deepEqual(config.users, [
      { username: "ayase", password: "secret", displayName: "Ayase" },
    ]);
  });

  it("reports invalid users JSON with the config variable name", () => {
    assert.throws(
      () =>
        readRuntimeConfig({
          CHISATALK_DATABASE_PATH: "/tmp/chisatalk.sqlite",
          CHISATALK_MODELS_PATH: "/tmp/models.json",
          CHISATALK_SESSION_SECRET: "secret",
          CHISATALK_USERS_JSON: "{not-json",
        }),
      /CHISATALK_USERS_JSON 不是合法 JSON/,
    );
  });

  it("requires users JSON to be an array", () => {
    assert.throws(
      () =>
        readRuntimeConfig({
          CHISATALK_DATABASE_PATH: "/tmp/chisatalk.sqlite",
          CHISATALK_MODELS_PATH: "/tmp/models.json",
          CHISATALK_SESSION_SECRET: "secret",
          CHISATALK_USERS_JSON: JSON.stringify({ username: "ayase" }),
        }),
      /CHISATALK_USERS_JSON 必须是用户数组/,
    );
  });

  it("sanitizes provider secrets in the model module", () => {
    const visible = sanitizeModel({
      id: "mimo",
      label: "MiMo",
      providerType: "openai-compatible",
      apiKey: "secret",
      chatCompletionsUrl: "https://example.test/v1/chat/completions",
      enabled: true,
    });

    assert.equal("apiKey" in visible, false);
    assert.equal("chatCompletionsUrl" in visible, false);
    assert.equal(visible.id, "mimo");
  });

  it("sanitizes a full models config without changing public shape", () => {
    const config = sanitizeModelsConfig({
      updatedAt: "2026-06-27T00:00:00.000Z",
      models: [
        {
          id: "hermes",
          providerType: "hermes-agent",
          apiKey: "secret",
          chatCompletionsUrl: "http://127.0.0.1:8642/v1",
        },
      ],
    });

    assert.equal(config.updatedAt, "2026-06-27T00:00:00.000Z");
    assert.deepEqual(config.models, [{ id: "hermes", providerType: "hermes-agent" }]);
  });

  it("extracts GitHub repo refs without requiring the HTTP server module", () => {
    assert.deepEqual(findGitHubRepoRefs("请检查 GitHub 仓库 ChisaAlter/chisatalk 是否存在"), [
      { owner: "ChisaAlter", repo: "chisatalk" },
    ]);
  });

  it("exposes database query helpers through a repository module", () => {
    const rows = [{ id: "row-1" }, { id: "row-2" }];
    const statement = {
      bind: () => undefined,
      step: () => rows.length > 0,
      getAsObject: () => rows.shift(),
      free: () => undefined,
    };
    const db = {
      prepare: () => statement,
    };

    assert.deepEqual(selectAll(db, "SELECT * FROM demo"), [{ id: "row-1" }, { id: "row-2" }]);
    assert.equal(selectOne(db, "SELECT * FROM demo"), null);
  });
});
