import type { PageSnapshot } from "@/shared/types/domain";
import type {
  ExtensionRequest,
  ExtensionResponse,
} from "@/shared/types/messages";

export interface PermissionRequest {
  permissions?: chrome.runtime.ManifestPermissions[];
  origins?: string[];
}

export interface ChromeAdapter {
  containsPermissions(request: PermissionRequest): Promise<boolean>;
  requestPermissions(request: PermissionRequest): Promise<boolean>;
  queryTabs(query: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]>;
  getTab(tabId: number): Promise<chrome.tabs.Tab>;
  executeExtraction(tabId: number, taskId: string): Promise<unknown>;
  sendMessage(request: ExtensionRequest): Promise<ExtensionResponse>;
}

export class BrowserChromeAdapter implements ChromeAdapter {
  containsPermissions(request: PermissionRequest): Promise<boolean> {
    return chrome.permissions.contains(request);
  }

  requestPermissions(request: PermissionRequest): Promise<boolean> {
    return chrome.permissions.request(request);
  }

  queryTabs(query: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
    return chrome.tabs.query(query);
  }

  getTab(tabId: number): Promise<chrome.tabs.Tab> {
    return chrome.tabs.get(tabId);
  }

  async executeExtraction(tabId: number, taskId: string): Promise<unknown> {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (input: {
        metadataKey: string;
        metadata: { tabId: number; taskId: string; sourceId: string };
      }) => {
        Object.defineProperty(globalThis, input.metadataKey, {
          configurable: true,
          enumerable: false,
          value: input.metadata,
          writable: true,
        });
      },
      args: [
        {
          metadataKey: "__contextPilotExtraction",
          metadata: { tabId, taskId, sourceId: `T${tabId}` },
        },
      ],
    });
    const results = await chrome.scripting.executeScript<[], PageSnapshot>({
      target: { tabId },
      files: ["extract-page.js"],
    });
    const result = results.find((item) => item.frameId === 0)?.result;

    if (!result) {
      throw new Error(`Extraction task ${taskId} returned no result`);
    }

    return result;
  }

  sendMessage(request: ExtensionRequest): Promise<ExtensionResponse> {
    return chrome.runtime.sendMessage(request);
  }
}
