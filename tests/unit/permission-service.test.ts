import { describe, expect, it, vi } from "vitest";

import {
  PermissionService,
  originPatternForPage,
} from "@/services/browser/permission-service";
import type { ChromeAdapter } from "@/services/browser/chrome-adapter";

function adapter(): ChromeAdapter {
  return {
    containsPermissions: vi.fn().mockResolvedValue(false),
    requestPermissions: vi.fn().mockResolvedValue(true),
    queryTabs: vi.fn().mockResolvedValue([]),
    getTab: vi.fn(),
    executeExtraction: vi.fn(),
    sendMessage: vi.fn(),
    canAccessTab: vi.fn().mockResolvedValue(false),
  };
}

describe("PermissionService", () => {
  it("requests only the selected HTTPS origin", async () => {
    const chrome = adapter();
    const service = new PermissionService(chrome);

    await service.requestPageOrigin("https://docs.example.com/a?query=1");

    expect(chrome.requestPermissions).toHaveBeenCalledWith({
      origins: ["https://docs.example.com/*"],
    });
  });

  it("requests the tabs permission separately", async () => {
    const chrome = adapter();
    const service = new PermissionService(chrome);

    await service.requestTabsPermission();

    expect(chrome.requestPermissions).toHaveBeenCalledWith({ permissions: ["tabs"] });
  });

  it("allows local HTTP and rejects unsafe page origins", () => {
    expect(originPatternForPage("http://localhost:3000/page")).toBe(
      "http://localhost:3000/*",
    );
    expect(originPatternForPage("http://127.0.0.1:4173/page")).toBe(
      "http://127.0.0.1:4173/*",
    );
    expect(() => originPatternForPage("http://example.com/page")).toThrow();
    expect(() => originPatternForPage("chrome://settings")).toThrow();
    expect(() => originPatternForPage("https://user:secret@example.com/")).toThrow();
  });
});
