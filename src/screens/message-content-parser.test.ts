import { describe, expect, it } from "vitest";
import { formatTableRowsForDisplay, parseMessageContent } from "./message-content-parser";

describe("parseMessageContent", () => {
  it("parses markdown tables without exposing separator rows", () => {
    const tokens = parseMessageContent(
      [
        "| 入弯前 | 弯心(Apex) | 出弯后 |",
        "| --- | --- | --- |",
        "| 外侧 | 内侧 | 外侧 |",
      ].join("\n"),
    );

    expect(tokens).toEqual([
      {
        type: "table",
        headers: ["入弯前", "弯心(Apex)", "出弯后"],
        rows: [["外侧", "内侧", "外侧"]],
      },
    ]);
  });

  it("normalizes table rows for a vertical mobile display", () => {
    expect(
      formatTableRowsForDisplay({
        headers: ["时间", "入弯前", "出弯后"],
        rows: [
          ["10 分钟", "外侧", "内侧"],
          ["20 分钟", "减速"],
        ],
      }),
    ).toEqual([
      {
        cells: [
          { header: "时间", value: "10 分钟" },
          { header: "入弯前", value: "外侧" },
          { header: "出弯后", value: "内侧" },
        ],
      },
      {
        cells: [
          { header: "时间", value: "20 分钟" },
          { header: "入弯前", value: "减速" },
          { header: "出弯后", value: "" },
        ],
      },
    ]);
  });

  it("keeps pipe text inside fenced code blocks as code", () => {
    const tokens = parseMessageContent(
      [
        "```",
        "| key | value |",
        "| --- | --- |",
        "| a | b |",
        "```",
      ].join("\n"),
    );

    expect(tokens).toEqual([
      {
        type: "code",
        language: null,
        text: "| key | value |\n| --- | --- |\n| a | b |",
      },
    ]);
  });

  it("parses headings, lists, paragraphs, dividers, and markdown images", () => {
    const tokens = parseMessageContent(
      [
        "# 标题",
        "",
        "普通段落第一行",
        "普通段落第二行",
        "",
        "- 第一项",
        "1. 第二项",
        "",
        "---",
        "",
        "![图](https://example.com/a.png)",
      ].join("\n"),
    );

    expect(tokens).toEqual([
      { type: "heading", level: 1, text: "标题" },
      { type: "paragraph", text: "普通段落第一行\n普通段落第二行" },
      { type: "list", ordered: false, items: ["第一项"] },
      { type: "list", ordered: true, items: ["第二项"] },
      { type: "divider" },
      { type: "image", alt: "图", uri: "https://example.com/a.png" },
    ]);
  });

  it("parses bare image urls but keeps non-image urls as text", () => {
    const tokens = parseMessageContent(
      [
        "https://example.com/a.webp",
        "",
        "https://example.com/page",
      ].join("\n"),
    );

    expect(tokens).toEqual([
      { type: "image", alt: null, uri: "https://example.com/a.webp" },
      { type: "paragraph", text: "https://example.com/page" },
    ]);
  });
});
