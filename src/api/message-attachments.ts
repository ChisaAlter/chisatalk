import type { ChisaTalkImageAttachment, JsonValue } from "./chisatalk-client";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readMessageImageAttachments(providerMeta: JsonValue | null): ChisaTalkImageAttachment[] {
  if (!isRecord(providerMeta) || !Array.isArray(providerMeta.attachments)) {
    return [];
  }

  const attachments: ChisaTalkImageAttachment[] = [];
  for (const attachment of providerMeta.attachments) {
    if (!isRecord(attachment)) {
      continue;
    }
    const mimeType = attachment.mimeType;
    const dataUrl = attachment.dataUrl;
    const isImageAttachment =
      attachment.type === "image" &&
      typeof mimeType === "string" &&
      typeof dataUrl === "string" &&
      dataUrl.startsWith("data:image/");

    if (!isImageAttachment) {
      continue;
    }

    attachments.push({
      type: "image",
      mimeType,
      dataUrl,
      width: typeof attachment.width === "number" ? attachment.width : null,
      height: typeof attachment.height === "number" ? attachment.height : null,
      name: typeof attachment.name === "string" ? attachment.name : null,
    });
  }

  return attachments;
}
