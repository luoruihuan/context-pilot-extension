import { BrowserChromeAdapter } from "@/services/browser/chrome-adapter";
import { ExtractionClient } from "@/services/browser/extraction-client";
import type { TabReference } from "@/shared/types/domain";
import type { ExtensionResponse } from "@/shared/types/messages";

function expectResponse<T extends ExtensionResponse["type"]>(
  response: ExtensionResponse,
  type: T,
): Extract<ExtensionResponse, { type: T }> {
  if (response.type === "context-pilot/error") {
    throw Object.assign(new Error(response.message), { code: response.code });
  }
  if (response.type !== type) {
    throw new Error("Unexpected extension response");
  }
  return response as Extract<ExtensionResponse, { type: T }>;
}

export class RuntimeClient {
  readonly extraction: ExtractionClient;

  constructor(private readonly chrome = new BrowserChromeAdapter()) {
    this.extraction = new ExtractionClient((request) => this.chrome.sendMessage(request));
  }

  async listTabs(): Promise<TabReference[]> {
    const response = await this.chrome.sendMessage({ type: "context-pilot/get-tabs" });
    return expectResponse(response, "context-pilot/tabs").tabs;
  }

  async requestTabsPermission(): Promise<boolean> {
    const response = await this.chrome.sendMessage({ type: "context-pilot/request-tabs-permission" });
    return expectResponse(response, "context-pilot/tabs-permission").granted;
  }

  async requestOriginPermission(baseUrl: string): Promise<boolean> {
    const response = await this.chrome.sendMessage({
      type: "context-pilot/request-origin-permission",
      baseUrl,
    });
    return expectResponse(response, "context-pilot/origin-permission").granted;
  }

  async requestTabAccess(tabId: number, origin: string): Promise<boolean> {
    const response = await this.chrome.sendMessage({
      type: "context-pilot/request-tab-access",
      tabId,
      origin,
    });
    return expectResponse(response, "context-pilot/tab-access").granted;
  }
}
