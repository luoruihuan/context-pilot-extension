import { describe, expect, it } from "vitest";
import { buildContext } from "@/services/extraction";
import type { PageSnapshot } from "@/shared/types/domain";

function snapshot(sourceId: string, text: string, selectedText?: string): PageSnapshot {
  return {
    sourceId,
    tabId: Number(sourceId.slice(1)),
    title: `Title ${sourceId}`,
    url: `https://example.com/${sourceId}`,
    extractedAt: 1,
    routeVersion: `https://example.com/${sourceId}`,
    selectedText,
    description: `Description ${sourceId}`,
    headings: [{ level: 1, text: `Heading ${sourceId}` }],
    paragraphs: [text],
    lists: [[`List ${sourceId}`]],
    tables: [{ headers: ["Key"], rows: [[`Value ${sourceId}`]] }],
    plainText: text,
    extractionMethod: "readability",
    truncated: false,
  };
}

describe("buildContext", () => {
  it("wraps every source as explicitly untrusted content", () => {
    const result = buildContext([snapshot("T1", "Article body")]);

    expect(result.text).toBe(
      '<source id="T1" trust="untrusted-web-content">\n<title>Title T1</title>\n<url>https://example.com/T1</url>\n<content>Description T1\nArticle body\nList T1\nKey\nValue T1</content>\n</source>',
    );
    expect(result.sources).toEqual([
      { sourceId: "T1", title: "Title T1", url: "https://example.com/T1", extractedAt: 1 },
    ]);
    expect(result.totalCharacters).toBe(result.text.length);
    expect(result.truncated).toBe(false);
  });

  it("deterministically clips ten pages to 60000 characters while retaining all source metadata", () => {
    const snapshots = Array.from({ length: 10 }, (_, index) =>
      snapshot(`T${index + 1}`, "x".repeat(20_000), index === 0 ? "Current selection" : undefined),
    );

    const first = buildContext(snapshots);
    const second = buildContext(snapshots);

    expect(first.text).toBe(second.text);
    expect(first.totalCharacters).toBeLessThanOrEqual(60_000);
    expect(first.truncated).toBe(true);
    expect(first.sources).toHaveLength(10);
    expect(first.sources.map((source) => source.sourceId)).toEqual(
      ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10"],
    );
    expect(first.text).toContain("Current selection");
  });

  it("respects explicit total and per-page character limits", () => {
    const result = buildContext([snapshot("T1", "x".repeat(200))], {
      maxTotalCharacters: 180,
      maxPageCharacters: 120,
    });

    expect(result.totalCharacters).toBeLessThanOrEqual(180);
    expect(result.truncated).toBe(true);
  });

  it("prioritizes selected text, title, description, body, lists, and tables when clipping", () => {
    const source = snapshot("T1", "Body text", "Selected text");
    source.description = "Description text";
    source.lists = [["List text"]];
    source.tables = [{ headers: ["Column"], rows: [["Table text"]] }];

    const result = buildContext([source], { maxTotalCharacters: 195, maxPageCharacters: 195 });

    expect(result.text).toContain("Selected text");
    expect(result.text).toContain("Title T1");
    expect(result.text).toContain("Description text");
    expect(result.text).toContain("Body text");
    expect(result.text).not.toContain("Table text");
    expect(result.truncated).toBe(true);
  });
});
