import {
  BrowserChromeAdapter,
  type ChromeAdapter,
} from "@/services/browser/chrome-adapter";
import { ExtractionClient } from "@/services/browser/extraction-client";
import { validateModelBaseUrl } from "@/services/llm/url-policy";
import { originPatternForPage } from "@/services/browser/permission-service";
import type { TabReference } from "@/shared/types/domain";
import type { ExtensionResponse } from "@/shared/types/messages";

const PERMISSION_REQUEST_TIMEOUT_MS = 3_000;

async function requestPermissionWithTimeout(
  request: () => Promise<boolean>,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request(),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), PERMISSION_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

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

  constructor(
    private readonly chrome: Pick<ChromeAdapter, "sendMessage" | "requestPermissions"> = new BrowserChromeAdapter(),
  ) {
    this.extraction = new ExtractionClient((request) => this.chrome.sendMessage(request));
  }

  async listTabs(): Promise<TabReference[]> {
    const response = await this.chrome.sendMessage({ type: "context-pilot/get-tabs" });
    return expectResponse(response, "context-pilot/tabs").tabs;
  }

  async requestTabsPermission(): Promise<boolean> {
    return requestPermissionWithTimeout(() =>
      this.chrome.requestPermissions({ permissions: ["tabs"] }),
    );
  }

  async requestOriginPermission(baseUrl: string): Promise<boolean> {
    const { originPattern } = validateModelBaseUrl(baseUrl);
    return requestPermissionWithTimeout(() =>
      this.chrome.requestPermissions({ origins: [originPattern] }),
    );
  }

  async requestTabAccess(tabId: number, origin: string): Promise<boolean> {
    void tabId;
    return this.chrome.requestPermissions({ origins: [originPatternForPage(origin)] });
  }
}
