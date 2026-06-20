export type MessageContentToken =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 1 | 2; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "divider" }
  | { type: "code"; language: string | null; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "image"; alt: string | null; uri: string };

export interface TableDisplayRow {
  cells: { header: string; value: string }[];
}

const FENCE_PATTERN = /^```([\w-]+)?\s*$/;
const HEADING_PATTERN = /^(#{1,2})\s+(.+)$/;
const UNORDERED_LIST_PATTERN = /^\s*[-*]\s+(.+)$/;
const ORDERED_LIST_PATTERN = /^\s*\d+[.)]\s+(.+)$/;
const MARKDOWN_IMAGE_PATTERN = /^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)\s*$/i;
const BARE_IMAGE_URL_PATTERN = /^https?:\/\/\S+\.(?:png|jpe?g|webp|gif)(?:[?#]\S*)?$/i;

function isDivider(line: string): boolean {
  return /^-{3,}$/.test(line.trim());
}

function parsePipeCells(line: string): string[] {
  let value = line.trim();
  if (value.startsWith("|")) {
    value = value.slice(1);
  }
  if (value.endsWith("|")) {
    value = value.slice(0, -1);
  }
  return value.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const cells = parsePipeCells(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableStart(lines: string[], index: number): boolean {
  const current = lines[index]?.trim() ?? "";
  const next = lines[index + 1]?.trim() ?? "";
  return current.includes("|") && next.includes("|") && isTableSeparator(next);
}

function parseMarkdownImage(line: string): MessageContentToken | null {
  const match = line.trim().match(MARKDOWN_IMAGE_PATTERN);
  if (!match) {
    return null;
  }
  return {
    type: "image",
    alt: match[1] ? match[1] : null,
    uri: match[2],
  };
}

function parseBareImageUrl(line: string): MessageContentToken | null {
  const value = line.trim();
  if (!BARE_IMAGE_URL_PATTERN.test(value)) {
    return null;
  }
  return {
    type: "image",
    alt: null,
    uri: value,
  };
}

export function formatTableRowsForDisplay(
  table: Extract<MessageContentToken, { type: "table" }>,
): TableDisplayRow[] {
  const headers = table.headers.map((header, index) => header.trim() || `列 ${index + 1}`);
  if (headers.length === 0) {
    return [];
  }

  return table.rows.map((row) => ({
    cells: headers.map((header, index) => ({
      header,
      value: row[index]?.trim() ?? "",
    })),
  }));
}

function isBlockBoundary(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  const trimmed = line.trim();
  return (
    trimmed.length === 0 ||
    FENCE_PATTERN.test(trimmed) ||
    HEADING_PATTERN.test(trimmed) ||
    UNORDERED_LIST_PATTERN.test(line) ||
    ORDERED_LIST_PATTERN.test(line) ||
    isDivider(trimmed) ||
    parseMarkdownImage(trimmed) !== null ||
    parseBareImageUrl(trimmed) !== null ||
    isTableStart(lines, index)
  );
}

export function parseMessageContent(content: string): MessageContentToken[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const tokens: MessageContentToken[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      index += 1;
      continue;
    }

    const fenceMatch = trimmed.match(FENCE_PATTERN);
    if (fenceMatch) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE_PATTERN.test(lines[index]?.trim() ?? "")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      tokens.push({
        type: "code",
        language: fenceMatch[1] ?? null,
        text: codeLines.join("\n"),
      });
      continue;
    }

    if (isTableStart(lines, index)) {
      const headers = parsePipeCells(lines[index] ?? "");
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length) {
        const rowLine = lines[index]?.trim() ?? "";
        if (!rowLine.includes("|") || rowLine.length === 0 || isTableSeparator(rowLine)) {
          break;
        }
        const cells = parsePipeCells(rowLine);
        if (cells.length > 1) {
          rows.push(cells);
          index += 1;
          continue;
        }
        break;
      }
      tokens.push({ type: "table", headers, rows });
      continue;
    }

    const headingMatch = trimmed.match(HEADING_PATTERN);
    if (headingMatch) {
      tokens.push({
        type: "heading",
        level: headingMatch[1].length === 1 ? 1 : 2,
        text: headingMatch[2].trim(),
      });
      index += 1;
      continue;
    }

    const unorderedMatch = line.match(UNORDERED_LIST_PATTERN);
    const orderedMatch = line.match(ORDERED_LIST_PATTERN);
    if (unorderedMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch);
      const items: string[] = [];
      while (index < lines.length) {
        const itemLine = lines[index] ?? "";
        const itemMatch = ordered ? itemLine.match(ORDERED_LIST_PATTERN) : itemLine.match(UNORDERED_LIST_PATTERN);
        if (!itemMatch) {
          break;
        }
        items.push(itemMatch[1].trim());
        index += 1;
      }
      tokens.push({ type: "list", ordered, items });
      continue;
    }

    if (isDivider(trimmed)) {
      tokens.push({ type: "divider" });
      index += 1;
      continue;
    }

    const markdownImage = parseMarkdownImage(trimmed);
    if (markdownImage) {
      tokens.push(markdownImage);
      index += 1;
      continue;
    }

    const bareImageUrl = parseBareImageUrl(trimmed);
    if (bareImageUrl) {
      tokens.push(bareImageUrl);
      index += 1;
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && !isBlockBoundary(lines, index)) {
      paragraphLines.push(lines[index] ?? "");
      index += 1;
    }
    tokens.push({
      type: "paragraph",
      text: paragraphLines.join("\n").trim(),
    });
  }

  return tokens;
}
