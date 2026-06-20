import type { JsonValue } from "@/api/chisatalk-client";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function summarizeToolProgress(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const lines = value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const message = readText(item.message);
      if (message) {
        return message;
      }

      const toolName =
        readText(item.toolName) ??
        readText(item.name) ??
        readText(item.tool) ??
        readText(item.title);
      const status =
        readText(item.status) ??
        readText(item.state) ??
        readText(item.phase);
      if (toolName && status) {
        return `${toolName}：${status}`;
      }
      return toolName;
    })
    .filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join("\n") : null;
}

export function readMessageReasoning(providerMeta: JsonValue | null): string | null {
  if (!isRecord(providerMeta)) {
    return null;
  }

  const candidates = [
    providerMeta.reasoningContent,
    providerMeta.reasoning_content,
    providerMeta.reasoning,
    providerMeta.thinking,
    providerMeta.thoughts,
  ];

  for (const value of candidates) {
    const text = readText(value);
    if (text) {
      return text;
    }
  }

  return summarizeToolProgress(providerMeta.toolProgress);
}
