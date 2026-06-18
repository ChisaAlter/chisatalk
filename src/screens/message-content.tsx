import { Image, ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { parseMessageContent, type MessageContentToken } from "./message-content-parser";

interface MessageContentProps {
  content: string;
}

const styles = StyleSheet.create((theme) => ({
  root: {
    gap: theme.spacing[2],
  },
  paragraph: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: 24,
    includeFontPadding: false,
  },
  boldText: {
    fontWeight: theme.fontWeight.bold,
  },
  inlineCode: {
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.base,
    fontFamily: "monospace",
    fontSize: theme.fontSize.sm,
  },
  heading1: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    lineHeight: 24,
    fontWeight: theme.fontWeight.bold,
    includeFontPadding: false,
  },
  heading2: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: 22,
    fontWeight: theme.fontWeight.bold,
    includeFontPadding: false,
  },
  list: {
    gap: theme.spacing[1],
  },
  listItem: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  listMarker: {
    width: 22,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    lineHeight: 24,
    includeFontPadding: false,
  },
  listText: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: 24,
    includeFontPadding: false,
  },
  divider: {
    height: theme.borderWidth[1],
    backgroundColor: theme.colors.borderStrong,
    marginVertical: theme.spacing[1],
  },
  codeBlock: {
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  codeText: {
    color: theme.colors.foreground,
    fontFamily: "monospace",
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  tableScroll: {
    maxWidth: 260,
  },
  table: {
    borderTopWidth: theme.borderWidth[1],
    borderLeftWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.borderRadius.lg,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
  },
  tableHeaderCell: {
    minWidth: 88,
    maxWidth: 132,
    backgroundColor: theme.colors.surface2,
    borderRightWidth: theme.borderWidth[1],
    borderBottomWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderStrong,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  tableCell: {
    minWidth: 88,
    maxWidth: 132,
    backgroundColor: theme.colors.surface1,
    borderRightWidth: theme.borderWidth[1],
    borderBottomWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  tableHeaderText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    fontWeight: theme.fontWeight.bold,
    includeFontPadding: false,
  },
  tableText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    includeFontPadding: false,
  },
  image: {
    width: 220,
    height: 156,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
}));

type InlineSegment =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "code"; text: string };

function parseInlineSegments(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      segments.push({ type: "text", text: text.slice(cursor, match.index) });
    }
    if (match[2]) {
      segments.push({ type: "bold", text: match[2] });
    } else if (match[3]) {
      segments.push({ type: "code", text: match[3] });
    }
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    segments.push({ type: "text", text: text.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ type: "text", text }];
}

function InlineText({ text, style }: { text: string; style: object }) {
  return (
    <Text style={style}>
      {parseInlineSegments(text).map((segment, index) => {
        if (segment.type === "bold") {
          return (
            <Text key={index} style={styles.boldText}>
              {segment.text}
            </Text>
          );
        }
        if (segment.type === "code") {
          return (
            <Text key={index} style={styles.inlineCode}>
              {segment.text}
            </Text>
          );
        }
        return segment.text;
      })}
    </Text>
  );
}

function renderTable(token: Extract<MessageContentToken, { type: "table" }>, index: number) {
  const columnCount = token.headers.length;
  const normalizeCells = (cells: string[]) => {
    return Array.from({ length: columnCount }, (_, cellIndex) => cells[cellIndex] ?? "");
  };

  return (
    <ScrollView
      horizontal
      key={index}
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      style={styles.tableScroll}
    >
      <View style={styles.table}>
        <View style={styles.tableRow}>
          {token.headers.map((header, cellIndex) => (
            <View key={`header-${cellIndex}`} style={styles.tableHeaderCell}>
              <InlineText style={styles.tableHeaderText} text={header} />
            </View>
          ))}
        </View>
        {token.rows.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.tableRow}>
            {normalizeCells(row).map((cell, cellIndex) => (
              <View key={`cell-${rowIndex}-${cellIndex}`} style={styles.tableCell}>
                <InlineText style={styles.tableText} text={cell} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function renderToken(token: MessageContentToken, index: number) {
  switch (token.type) {
    case "heading":
      return (
        <InlineText
          key={index}
          style={token.level === 1 ? styles.heading1 : styles.heading2}
          text={token.text}
        />
      );
    case "paragraph":
      return <InlineText key={index} style={styles.paragraph} text={token.text} />;
    case "list":
      return (
        <View key={index} style={styles.list}>
          {token.items.map((item, itemIndex) => (
            <View key={itemIndex} style={styles.listItem}>
              <Text style={styles.listMarker}>{token.ordered ? `${itemIndex + 1}.` : "-"}</Text>
              <InlineText style={styles.listText} text={item} />
            </View>
          ))}
        </View>
      );
    case "divider":
      return <View key={index} style={styles.divider} />;
    case "code":
      return (
        <View key={index} style={styles.codeBlock}>
          <Text selectable style={styles.codeText}>
            {token.text}
          </Text>
        </View>
      );
    case "table":
      return renderTable(token, index);
    case "image":
      return <Image key={index} resizeMode="cover" source={{ uri: token.uri }} style={styles.image} />;
    default:
      return null;
  }
}

export function MessageContent({ content }: MessageContentProps) {
  const tokens = parseMessageContent(content);

  return <View style={styles.root}>{tokens.map(renderToken)}</View>;
}
