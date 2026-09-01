import { describe, expect, it } from "vitest";
import { modelProfileSchema, pageSnapshotSchema } from "@/shared/types/domain";

describe("domain schemas", () => {
  it("rejects an invalid provider", () => {
    expect(() => modelProfileSchema.parse({ provider: "gemini" })).toThrow();
  });

  it("accepts a minimal page snapshot", () => {
    const result = pageSnapshotSchema.parse({
      sourceId: "T1",
      tabId: 1,
      title: "Page",
      url: "https://example.com",
      extractedAt: 1,
      routeVersion: "https://example.com",
      headings: [],
      paragraphs: ["Body"],
      lists: [],
      tables: [],
      plainText: "Body",
      extractionMethod: "readability",
      truncated: false,
    });
    expect(result.sourceId).toBe("T1");
  });
});
