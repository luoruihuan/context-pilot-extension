import type { PageSnapshot } from "@/shared/types/domain";
import type {
  ExtensionRequest,
  ExtensionResponse,
} from "@/shared/types/messages";

export type TabExtractionResult =
  | { tabId: number; status: "fulfilled"; snapshot: PageSnapshot }
  | { tabId: number; status: "rejected"; code: string; message: string };

type SendMessage = (request: ExtensionRequest) => Promise<ExtensionResponse>;

export class ExtractionClient {
  constructor(private readonly sendMessage: SendMessage) {}

  async extractTabs(tabIds: number[]): Promise<TabExtractionResult[]> {
    if (
      tabIds.length === 0 ||
      tabIds.length > 10 ||
      new Set(tabIds).size !== tabIds.length ||
      tabIds.some((tabId) => !Number.isSafeInteger(tabId) || tabId <= 0)
    ) {
      throw new Error("Select between one and ten unique tabs");
    }

    const settled = await Promise.allSettled(
      tabIds.map(async (tabId) => {
        const taskId = crypto.randomUUID();
        const response = await this.sendMessage({
          type: "context-pilot/extract-page",
          tabId,
          taskId,
        });
        if (response.type === "context-pilot/page-snapshot") {
          return response.snapshot;
        }
        if (response.type === "context-pilot/error") {
          throw Object.assign(new Error(response.message), { code: response.code });
        }
        throw Object.assign(new Error("Unexpected extraction response"), {
          code: "INVALID_RESPONSE",
        });
      }),
    );

    return settled.map((result, index): TabExtractionResult => {
      const tabId = tabIds[index]!;
      if (result.status === "fulfilled") {
        return { tabId, status: "fulfilled", snapshot: result.value };
      }
      const error =
        result.reason instanceof Error ? result.reason : new Error("Extraction failed");
      const code =
        "code" in error && typeof error.code === "string"
          ? error.code
          : "EXTRACTION_FAILED";
      return { tabId, status: "rejected", code, message: error.message };
    });
  }
}
