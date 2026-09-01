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

  it.each([
    "https://api.example.com/v1",
    "http://localhost:11434/v1",
    "http://127.0.0.1:1234/v1",
  ])("accepts an allowed model base URL: %s", (baseUrl) => {
    const result = modelProfileSchema.parse({
      id: "profile-1",
      name: "Test profile",
      provider: "openai-chat",
      baseUrl,
      apiKey: "test-key",
      model: "test-model",
      maxOutputTokens: 100,
      isDefault: true,
      createdAt: 1,
      updatedAt: 1,
    });

    expect(result.baseUrl).toBe(baseUrl);
  });

  it.each([
    "http://api.example.com/v1",
    "ftp://api.example.com/v1",
    "not a URL",
    "https://user:password@api.example.com/v1",
    "https://api.example.com/v1#fragment",
  ])("rejects a disallowed model base URL: %s", (baseUrl) => {
    expect(() =>
      modelProfileSchema.parse({
        id: "profile-1",
        name: "Test profile",
        provider: "openai-chat",
        baseUrl,
        apiKey: "test-key",
        model: "test-model",
        maxOutputTokens: 100,
        isDefault: true,
        createdAt: 1,
        updatedAt: 1,
      }),
    ).toThrow();
  });
});
