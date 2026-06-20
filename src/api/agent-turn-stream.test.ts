import { describe, expect, it } from "vitest";
import { createAgentTurnSseParser, streamAgentTurn } from "./agent-turn-stream";

describe("agent-turn-stream", () => {
  it("parses chunked ChisaTalk agent turn SSE events", () => {
    const parser = createAgentTurnSseParser();

    expect(
      parser.push(
        'event: assistant_delta\ndata: {"delta":"你',
      ),
    ).toEqual([]);
    expect(
      parser.push(
        '好"}\n\nevent: tool_progress\ndata: {"toolName":"memory","status":"running"}\n\n',
      ),
    ).toEqual([
      { type: "assistant_delta", delta: "你好" },
      { type: "tool_progress", data: { toolName: "memory", status: "running" } },
    ]);
    expect(parser.push('event: done\ndata: {"ok":true}\n\n')).toEqual([{ type: "done" }]);
  });

  it("streams an agent turn with XMLHttpRequest progress events", async () => {
    const originalXhr = globalThis.XMLHttpRequest;
    const requests: MockXhr[] = [];
    class MockXhr {
      method = "";
      url = "";
      requestHeaders: Record<string, string> = {};
      body = "";
      responseText = "";
      status = 200;
      onprogress: (() => void) | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }

      setRequestHeader(key: string, value: string) {
        this.requestHeaders[key] = value;
      }

      send(body: string) {
        this.body = body;
        requests.push(this);
        this.responseText += 'event: assistant_delta\ndata: {"delta":"Hermes"}\n\n';
        this.onprogress?.();
        this.responseText += 'event: assistant_message\ndata: {"message":{"id":"msg-2","conversationId":"conv-1","role":"assistant","content":"Hermes","modelId":"hermes","clientMessageId":"server-1","providerMeta":null,"createdAt":"2026-06-18T01:00:00.000Z"},"conversation":{"id":"conv-1","title":"测试","userId":"admin","modelId":"hermes","archived":false,"createdAt":"2026-06-18T01:00:00.000Z","updatedAt":"2026-06-18T01:00:01.000Z"}}\n\n';
        this.onload?.();
      }
    }
    globalThis.XMLHttpRequest = MockXhr as unknown as typeof XMLHttpRequest;

    const events: unknown[] = [];
    try {
      await streamAgentTurn({
        accessToken: "token-123",
        conversationId: "conv-1",
        input: {
          content: "你好",
          modelId: "hermes",
          clientMessageId: "client-1",
          systemPrompt: "你是 ChisaTalk。",
        },
        onEvent: (event) => events.push(event),
      });
    } finally {
      globalThis.XMLHttpRequest = originalXhr;
    }

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.url).toBe("http://38.76.185.154:8789/v1/conversations/conv-1/agent-turns/stream");
    expect(requests[0]?.requestHeaders.Authorization).toBe("Bearer token-123");
    expect(JSON.parse(requests[0]?.body ?? "{}")).toMatchObject({
      content: "你好",
      modelId: "hermes",
      clientMessageId: "client-1",
      systemPrompt: "你是 ChisaTalk。",
    });
    expect(events).toEqual([
      { type: "assistant_delta", delta: "Hermes" },
      {
        type: "assistant_message",
        message: {
          id: "msg-2",
          conversationId: "conv-1",
          role: "assistant",
          content: "Hermes",
          modelId: "hermes",
          clientMessageId: "server-1",
          providerMeta: null,
          createdAt: "2026-06-18T01:00:00.000Z",
        },
        conversation: {
          id: "conv-1",
          title: "测试",
          userId: "admin",
          modelId: "hermes",
          archived: false,
          createdAt: "2026-06-18T01:00:00.000Z",
          updatedAt: "2026-06-18T01:00:01.000Z",
        },
      },
    ]);
  });

  it("resolves when the SSE done event arrives before XMLHttpRequest load", async () => {
    const originalXhr = globalThis.XMLHttpRequest;
    class MockXhr {
      method = "";
      url = "";
      requestHeaders: Record<string, string> = {};
      responseText = "";
      status = 200;
      readyState = 3;
      onprogress: (() => void) | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onreadystatechange: (() => void) | null = null;

      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }

      setRequestHeader(key: string, value: string) {
        this.requestHeaders[key] = value;
      }

      send() {
        this.responseText += 'event: assistant_delta\ndata: {"delta":"OK"}\n\n';
        this.responseText += 'event: done\ndata: {"ok":true}\n\n';
        this.onprogress?.();
      }
    }
    globalThis.XMLHttpRequest = MockXhr as unknown as typeof XMLHttpRequest;

    const events: unknown[] = [];
    try {
      await expect(
        streamAgentTurn({
          accessToken: "token-123",
          conversationId: "conv-1",
          input: {
            content: "ping",
            modelId: "hermes",
            clientMessageId: "client-1",
            systemPrompt: "test",
          },
          onEvent: (event) => events.push(event),
        }),
      ).resolves.toBeUndefined();
    } finally {
      globalThis.XMLHttpRequest = originalXhr;
    }

    expect(events).toEqual([
      { type: "assistant_delta", delta: "OK" },
      { type: "done" },
    ]);
  });

  it("resolves when the final assistant message arrives before stream close callbacks", async () => {
    const originalXhr = globalThis.XMLHttpRequest;
    class MockXhr {
      method = "";
      url = "";
      requestHeaders: Record<string, string> = {};
      responseText = "";
      status = 200;
      readyState = 3;
      onprogress: (() => void) | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onreadystatechange: (() => void) | null = null;

      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }

      setRequestHeader(key: string, value: string) {
        this.requestHeaders[key] = value;
      }

      send() {
        this.responseText += 'event: assistant_message\ndata: {"message":{"id":"msg-final","conversationId":"conv-1","role":"assistant","content":"DONE","modelId":"hermes","clientMessageId":"server-1","providerMeta":null,"createdAt":"2026-06-18T01:00:00.000Z"},"conversation":{"id":"conv-1","title":"测试","userId":"admin","modelId":"hermes","archived":false,"createdAt":"2026-06-18T01:00:00.000Z","updatedAt":"2026-06-18T01:00:01.000Z"}}\n\n';
        this.onprogress?.();
      }
    }
    globalThis.XMLHttpRequest = MockXhr as unknown as typeof XMLHttpRequest;

    const events: unknown[] = [];
    try {
      await expect(
        Promise.race([
          streamAgentTurn({
            accessToken: "token-123",
            conversationId: "conv-1",
            input: {
              content: "ping",
              modelId: "hermes",
              clientMessageId: "client-1",
              systemPrompt: "test",
            },
            onEvent: (event) => events.push(event),
          }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error("stream did not settle")), 25);
          }),
        ]),
      ).resolves.toBeUndefined();
    } finally {
      globalThis.XMLHttpRequest = originalXhr;
    }

    expect(events).toEqual([
      {
        type: "assistant_message",
        message: {
          id: "msg-final",
          conversationId: "conv-1",
          role: "assistant",
          content: "DONE",
          modelId: "hermes",
          clientMessageId: "server-1",
          providerMeta: null,
          createdAt: "2026-06-18T01:00:00.000Z",
        },
        conversation: {
          id: "conv-1",
          title: "测试",
          userId: "admin",
          modelId: "hermes",
          archived: false,
          createdAt: "2026-06-18T01:00:00.000Z",
          updatedAt: "2026-06-18T01:00:01.000Z",
        },
      },
    ]);
  });

  it("aborts an in-flight Hermes stream when the caller cancels it", async () => {
    const originalXhr = globalThis.XMLHttpRequest;
    let abortCalled = false;

    class MockXhr {
      method = "";
      url = "";
      requestHeaders: Record<string, string> = {};
      responseText = "";
      status = 200;
      readyState = 3;
      aborted = false;
      onprogress: (() => void) | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onreadystatechange: (() => void) | null = null;
      onabort: (() => void) | null = null;

      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }

      setRequestHeader(key: string, value: string) {
        this.requestHeaders[key] = value;
      }

      send() {
        // Keep the request open until the AbortController cancels it.
      }

      abort() {
        this.aborted = true;
        abortCalled = true;
        this.onabort?.();
      }
    }

    globalThis.XMLHttpRequest = MockXhr as unknown as typeof XMLHttpRequest;
    const controller = new AbortController();

    try {
      const promise = streamAgentTurn({
        accessToken: "token-123",
        conversationId: "conv-1",
        signal: controller.signal,
        input: {
          content: "ping",
          modelId: "hermes",
          clientMessageId: "client-1",
          systemPrompt: "test",
        },
        onEvent: () => {},
      });
      controller.abort();

      await expect(promise).rejects.toThrow("Hermes Agent 请求已取消");
      expect(abortCalled).toBe(true);
    } finally {
      globalThis.XMLHttpRequest = originalXhr;
    }
  });
});
