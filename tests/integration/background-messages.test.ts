import { describe, expect, it, vi } from "vitest";

import {
  BrowserChromeAdapter,
  type ChromeAdapter,
} from "@/services/browser/chrome-adapter";
import { BackgroundMessageRouter } from "@/services/browser/background-router";
import { ExtractionClient } from "@/services/browser/extraction-client";
import { PermissionService } from "@/services/browser/permission-service";
import { RuntimeClient } from "@/services/browser/runtime-client";
import { TabService } from "@/services/browser/tab-service";
import type { PageSnapshot } from "@/shared/types/domain";

function snapshot(tabId: number): PageSnapshot {
  return {
    sourceId: `T${tabId}`,
    tabId,
    title: `Page ${tabId}`,
    url: `https://example.com/${tabId}`,
    extractedAt: 1,
    routeVersion: `https://example.com/${tabId}`,
    headings: [],
    paragraphs: [`Body ${tabId}`],
    lists: [],
    tables: [],
    plainText: `Body ${tabId}`,
    extractionMethod: "visible-text",
    truncated: false,
  };
}

function adapter(overrides: Partial<ChromeAdapter> = {}): ChromeAdapter {
  return {
    containsPermissions: vi.fn().mockResolvedValue(true),
    requestPermissions: vi.fn().mockResolvedValue(true),
    queryTabs: vi.fn().mockResolvedValue([]),
    getTab: vi.fn(),
    executeExtraction: vi.fn(),
    sendMessage: vi.fn(),
    canAccessTab: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function router(chrome: ChromeAdapter): BackgroundMessageRouter {
  const permissions = new PermissionService(chrome);
  return new BackgroundMessageRouter(
    "extension-id",
    new TabService(chrome, permissions),
    permissions,
    chrome,
  );
}

describe("BackgroundMessageRouter", () => {
  it("does not treat a newly active tab as an activeTab grant", async () => {
    const chrome = adapter({
      containsPermissions: vi.fn().mockResolvedValue(false),
      canAccessTab: vi.fn().mockResolvedValue(false),
      queryTabs: vi.fn().mockResolvedValue([
        { id: 8, windowId: 1, active: true, title: "New active page", url: "https://new.example/page" },
      ]),
      getTab: vi.fn().mockResolvedValue({
        id: 8, windowId: 1, active: true, title: "New active page", url: "https://new.example/page",
      }),
    });

    await expect(
      router(chrome).handle({ type: "context-pilot/get-tabs" }, { id: "extension-id" }),
    ).resolves.toMatchObject({
      type: "context-pilot/tabs",
      tabs: [{ tabId: 8, isCurrent: true, permission: "required" }],
    });
    await expect(
      router(chrome).handle(
        { type: "context-pilot/extract-page", tabId: 8, taskId: "task-8" },
        { id: "extension-id" },
      ),
    ).resolves.toMatchObject({ type: "context-pilot/error", code: "PERMISSION_REQUIRED" });
    expect(chrome.executeExtraction).not.toHaveBeenCalled();
  });

  it("derives and requests the optional model origin from a validated base URL", async () => {
    const requestPermissions = vi.fn().mockResolvedValue(false);
    const chrome = adapter({
      containsPermissions: vi.fn().mockResolvedValue(false),
      requestPermissions,
    });

    await expect(
      router(chrome).handle(
        {
          type: "context-pilot/request-origin-permission",
          baseUrl: "https://models.example.com/v1/",
        },
        { id: "extension-id" },
      ),
    ).resolves.toEqual({
      type: "context-pilot/origin-permission",
      granted: false,
    });
    expect(requestPermissions).toHaveBeenCalledWith({
      origins: ["https://models.example.com/*"],
    });
  });

  it("rejects invalid model origins without requesting permissions", async () => {
    const requestPermissions = vi.fn();
    const chrome = adapter({ requestPermissions });

    await expect(
      router(chrome).handle(
        {
          type: "context-pilot/request-origin-permission",
          baseUrl: "http://models.example.com/v1",
        },
        { id: "extension-id" },
      ),
    ).resolves.toMatchObject({
      type: "context-pilot/error",
    });
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("requests optional tabs permission only through an explicit message", async () => {
    const requestPermissions = vi.fn().mockResolvedValue(false);
    const chrome = adapter({
      containsPermissions: vi.fn().mockResolvedValue(false),
      requestPermissions,
    });

    await expect(
      router(chrome).handle(
        { type: "context-pilot/request-tabs-permission" },
        { id: "extension-id" },
      ),
    ).resolves.toMatchObject({
      type: "context-pilot/tabs-permission",
      granted: false,
    });
    expect(requestPermissions).toHaveBeenCalledWith({ permissions: ["tabs"] });
  });

  it("does not prompt for tabs permission again after it is granted", async () => {
    const requestPermissions = vi.fn();
    const chrome = adapter({
      containsPermissions: vi.fn().mockResolvedValue(true),
      requestPermissions,
    });

    await expect(
      router(chrome).handle(
        { type: "context-pilot/request-tabs-permission" },
        { id: "extension-id" },
      ),
    ).resolves.toMatchObject({
      type: "context-pilot/tabs-permission",
      granted: true,
    });
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("keeps restricted tabs in the picker data", async () => {
    const chrome = adapter({
      queryTabs: vi.fn().mockResolvedValue([
        { id: 9, windowId: 1, active: false, title: "Chrome settings", url: "chrome://settings" },
      ]),
    });

    await expect(
      router(chrome).handle(
        { type: "context-pilot/get-tabs" },
        { id: "extension-id" },
      ),
    ).resolves.toMatchObject({
      type: "context-pilot/tabs",
      tabs: [{ tabId: 9, permission: "restricted" }],
    });
  });
  it("rejects extraction from restricted target schemes", async () => {
    const chrome = adapter({
      getTab: vi.fn().mockResolvedValue({
        id: 3,
        windowId: 1,
        active: false,
        title: "Settings",
        url: "chrome://settings",
      }),
    });

    await expect(
      router(chrome).handle(
        { type: "context-pilot/extract-page", tabId: 3, taskId: "task-1" },
        { id: "extension-id" },
      ),
    ).resolves.toMatchObject({
      type: "context-pilot/error",
      code: "RESTRICTED_PAGE",
    });
    expect(chrome.executeExtraction).not.toHaveBeenCalled();
  });

  it("rejects messages not sent by this extension", async () => {
    const chrome = adapter();

    await expect(
      router(chrome).handle(
        { type: "context-pilot/get-tabs" },
        { id: "another-extension" },
      ),
    ).resolves.toMatchObject({
      type: "context-pilot/error",
      code: "INVALID_SENDER",
    });
  });

  it("derives the requested origin from the target tab instead of trusting input", async () => {
    const requestPermissions = vi.fn().mockResolvedValue(true);
    const chrome = adapter({
      containsPermissions: vi.fn().mockResolvedValue(false),
      requestPermissions,
      getTab: vi.fn().mockResolvedValue({
        id: 4,
        windowId: 1,
        active: false,
        title: "Docs",
        url: "https://docs.example.com/guide",
      }),
    });

    const response = await router(chrome).handle(
      {
        type: "context-pilot/request-tab-access",
        tabId: 4,
        origin: "https://attacker.example",
      },
      { id: "extension-id" },
    );

    expect(response).toMatchObject({
      type: "context-pilot/tab-access",
      tabId: 4,
      granted: true,
    });
    expect(requestPermissions).toHaveBeenCalledWith({
      origins: ["https://docs.example.com/*"],
    });
  });

  it("validates injected extraction results before returning them", async () => {
    const chrome = adapter({
      getTab: vi.fn().mockResolvedValue({
        id: 5,
        windowId: 1,
        active: true,
        title: "Page",
        url: "https://example.com/5",
      }),
      executeExtraction: vi.fn().mockResolvedValue({ tabId: 5 }),
    });

    await expect(
      router(chrome).handle(
        { type: "context-pilot/extract-page", tabId: 5, taskId: "task-5" },
        { id: "extension-id" },
      ),
    ).resolves.toMatchObject({
      type: "context-pilot/error",
      code: "INVALID_SNAPSHOT",
    });
  });

  it("normalizes an active-tab injection failure to permission required", async () => {
    const chrome = adapter({
      getTab: vi.fn().mockResolvedValue({
        id: 6,
        windowId: 1,
        active: true,
        title: "Page",
        url: "https://example.com/6",
      }),
      executeExtraction: vi.fn().mockRejectedValue(new Error("Cannot access contents")),
    });

    await expect(
      router(chrome).handle(
        { type: "context-pilot/extract-page", tabId: 6, taskId: "task-6" },
        { id: "extension-id" },
      ),
    ).resolves.toMatchObject({
      type: "context-pilot/error",
      code: "PERMISSION_REQUIRED",
    });
  });
});

describe("RuntimeClient", () => {
  it("requests tabs permission directly so Chrome can keep the user gesture", async () => {
    const chrome = adapter({
      requestPermissions: vi.fn().mockResolvedValue(true),
      sendMessage: vi.fn(),
    });
    const client = new RuntimeClient(chrome);

    await expect(client.requestTabsPermission()).resolves.toBe(true);
    expect(chrome.requestPermissions).toHaveBeenCalledWith({ permissions: ["tabs"] });
    expect(chrome.sendMessage).not.toHaveBeenCalled();
  });

  it("requests model origin directly so Chrome can keep the user gesture", async () => {
    const chrome = adapter({
      containsPermissions: vi.fn().mockResolvedValue(false),
      requestPermissions: vi.fn().mockResolvedValue(true),
      sendMessage: vi.fn(),
    });
    const client = new RuntimeClient(chrome);

    await expect(client.requestOriginPermission("https://models.example.com/v1/messages")).resolves.toBe(true);
    expect(chrome.requestPermissions).toHaveBeenCalledWith({
      origins: ["https://models.example.com/*"],
    });
    expect(chrome.sendMessage).not.toHaveBeenCalled();
  });

  it("sends the explicit tabs permission request", async () => {
    const chrome = adapter({
      requestPermissions: vi.fn().mockResolvedValue(true),
      sendMessage: vi.fn(),
    });
    const client = new RuntimeClient(chrome);

    await expect(client.requestTabsPermission()).resolves.toBe(true);
    expect(chrome.requestPermissions).toHaveBeenCalledWith({ permissions: ["tabs"] });
    expect(chrome.sendMessage).not.toHaveBeenCalled();
  });
});

describe("ExtractionClient", () => {
  it("keeps selection order and exposes individual failures", async () => {
    const sendMessage = vi.fn(async (request: unknown) => {
      const tabId = (request as { tabId: number }).tabId;
      if (tabId === 2) {
        return {
          type: "context-pilot/error" as const,
          code: "TAB_CLOSED",
          message: "closed",
        };
      }
      await new Promise((resolve) => setTimeout(resolve, tabId === 1 ? 5 : 0));
      return {
        type: "context-pilot/page-snapshot" as const,
        taskId: `task-${tabId}`,
        snapshot: snapshot(tabId),
      };
    });
    const client = new ExtractionClient(sendMessage);

    const results = await client.extractTabs([1, 2, 3]);

    expect(results.map((result) => result.tabId)).toEqual([1, 2, 3]);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
      "fulfilled",
    ]);
  });

  it("rejects invalid tab IDs and more than ten selections", async () => {
    const client = new ExtractionClient(vi.fn());
    await expect(client.extractTabs([1, 1])).rejects.toThrow();
    await expect(
      client.extractTabs(Array.from({ length: 11 }, (_, index) => index + 1)),
    ).rejects.toThrow();
  });
});

describe("Browser extraction metadata", () => {
  it("requires injected metadata to match the current task", async () => {
    const { readExtractionMetadata } = await import(
      "@/services/browser/extraction-metadata"
    );
    const target: Record<string, unknown> = {};
    target.__contextPilotExtraction = {
      tabId: 7,
      taskId: "task-7",
      sourceId: "T7",
    };

    expect(readExtractionMetadata(target, "task-7")).toEqual({
      tabId: 7,
      taskId: "task-7",
      sourceId: "T7",
    });
    expect(() => readExtractionMetadata(target, "another-task")).toThrow();
  });

  it("claims isolated task metadata and only clears the matching task", async () => {
    const { clearExtractionMetadata, readExtractionMetadata } = await import(
      "@/services/browser/extraction-metadata"
    );
    const target: Record<string, unknown> = {
      __contextPilotExtraction: {
        "task-a": { tabId: 7, taskId: "task-a", sourceId: "T7" },
        "task-b": { tabId: 7, taskId: "task-b", sourceId: "T7" },
      },
    };

    expect(readExtractionMetadata(target)).toMatchObject({ taskId: "task-a" });
    clearExtractionMetadata(target, "task-a");
    expect(readExtractionMetadata(target, "task-b")).toMatchObject({ taskId: "task-b" });
    expect(() => readExtractionMetadata(target, "task-a")).toThrow();
    clearExtractionMetadata(target, "task-b");
    expect(() => readExtractionMetadata(target)).toThrow();
  });

  it("serializes same-tab extraction so injected scripts keep their task order", async () => {
    const {
      clearExtractionMetadata,
      EXTRACTION_METADATA_KEY,
      readExtractionMetadata,
    } = await import("@/services/browser/extraction-metadata");
    const target = globalThis as unknown as Record<string, unknown>;
    let activeFileInjections = 0;
    let maxActiveFileInjections = 0;
    const claimedTaskIds: string[] = [];
    type MetadataInput = {
      metadataKey: string;
      metadata: { tabId: number; taskId: string; sourceId: string };
    };
    const executeScript = vi.fn(async (details: {
      args?: [MetadataInput];
      files?: string[];
      func?: (input: MetadataInput) => void;
    }) => {
      if (details.func && details.args) {
        details.func(details.args[0]);
        return [{ frameId: 0, result: true }];
      }
      activeFileInjections += 1;
      maxActiveFileInjections = Math.max(maxActiveFileInjections, activeFileInjections);
      const metadata = readExtractionMetadata(target);
      claimedTaskIds.push(metadata.taskId);
      await Promise.resolve();
      clearExtractionMetadata(target, metadata.taskId);
      activeFileInjections -= 1;
      return [{ frameId: 0, result: snapshot(metadata.tabId) }];
    });
    vi.stubGlobal("chrome", { scripting: { executeScript } });

    try {
      const chromeAdapter = new BrowserChromeAdapter();
      const older = chromeAdapter.executeExtraction(7, "task-a");
      const newer = chromeAdapter.executeExtraction(7, "task-b");

      await expect(Promise.all([older, newer])).resolves.toHaveLength(2);
      expect(maxActiveFileInjections).toBe(1);
      expect(claimedTaskIds).toEqual(["task-a", "task-b"]);
      expect(() => readExtractionMetadata(target)).toThrow();
    } finally {
      delete target[EXTRACTION_METADATA_KEY];
      vi.unstubAllGlobals();
    }
  });

  it("cleans failed task metadata before allowing the next same-tab extraction", async () => {
    const {
      clearExtractionMetadata,
      EXTRACTION_METADATA_KEY,
      readExtractionMetadata,
    } = await import("@/services/browser/extraction-metadata");
    const target = globalThis as unknown as Record<string, unknown>;
    let failNextFileInjection = true;
    type MetadataInput = {
      metadataKey: string;
      metadata?: { tabId: number; taskId: string; sourceId: string };
      taskId?: string;
    };
    const executeScript = vi.fn(async (details: {
      args?: [MetadataInput];
      files?: string[];
      func?: (input: MetadataInput) => void;
    }) => {
      if (details.func && details.args) {
        details.func(details.args[0]);
        return [{ frameId: 0, result: true }];
      }
      if (failNextFileInjection) {
        failNextFileInjection = false;
        throw new Error("File injection failed");
      }
      const metadata = readExtractionMetadata(target);
      clearExtractionMetadata(target, metadata.taskId);
      return [{ frameId: 0, result: snapshot(metadata.tabId) }];
    });
    vi.stubGlobal("chrome", { scripting: { executeScript } });

    try {
      const chromeAdapter = new BrowserChromeAdapter();
      await expect(chromeAdapter.executeExtraction(7, "task-failed")).rejects.toThrow("File injection failed");
      expect(() => readExtractionMetadata(target, "task-failed")).toThrow();
      await expect(chromeAdapter.executeExtraction(7, "task-next")).resolves.toMatchObject({ tabId: 7 });
      expect(() => readExtractionMetadata(target)).toThrow();
    } finally {
      delete target[EXTRACTION_METADATA_KEY];
      vi.unstubAllGlobals();
    }
  });
});
