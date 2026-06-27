import type { JsonValue } from "@/api/chisatalk-client";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function labelToolName(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    execute_code: "执行代码",
    terminal: "终端命令",
    memory: "检索记忆",
    web_search: "联网搜索",
    web_extract: "读取网页",
  };
  return labels[normalized] ?? value.trim();
}

function labelProgressState(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    running: "进行中",
    started: "进行中",
    done: "已完成",
    completed: "已完成",
    pending_approval: "等待确认",
    waiting_for_approval: "等待确认",
    approval_requested: "等待确认",
  };
  return labels[normalized] ?? value.trim();
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

      const event = readText(item.event);
      if (event === "approval.request") {
        const toolName = readText(item.toolName) ?? readText(item.tool) ?? readText(item.name);
        const description = readText(item.description);
        const command = readText(item.command);
        const target = description ?? command ?? (toolName ? labelToolName(toolName) : "高权限操作");
        return `等待你确认：${target}`;
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
        return `${labelToolName(toolName)}：${labelProgressState(status)}`;
      }
      return toolName ? labelToolName(toolName) : null;
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
