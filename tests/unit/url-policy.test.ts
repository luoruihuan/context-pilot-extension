import { describe, expect, it } from "vitest";
import { validateModelBaseUrl } from "@/services/llm/url-policy";

describe("validateModelBaseUrl", () => {
  it("allows HTTPS and local HTTP only", () => {
    expect(validateModelBaseUrl("https://api.example.com/v1").originPattern).toBe(
      "https://api.example.com/*",
    );
    expect(() => validateModelBaseUrl("http://api.example.com/v1")).toThrow(
      "HTTPS or local HTTP",
    );
    expect(validateModelBaseUrl("http://localhost:11434/v1").url.port).toBe("11434");
  });

  it.each([
    "https://key@example.com/v1",
    "https://example.com/v1#fragment",
    "not a URL",
  ])("rejects unsafe base URLs: %s", (value) => {
    expect(() => validateModelBaseUrl(value)).toThrow();
  });
});
