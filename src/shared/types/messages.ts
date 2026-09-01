import type { PageSnapshot, TabReference } from "@/shared/types/domain";

export type ExtensionRequest =
  | { type: "context-pilot/get-tabs" }
  | { type: "context-pilot/request-tabs-permission" }
  | { type: "context-pilot/request-tab-access"; tabId: number; origin: string }
  | { type: "context-pilot/extract-page"; tabId: number; taskId: string };

export type ExtensionResponse =
  | { type: "context-pilot/tabs"; tabs: TabReference[] }
  | { type: "context-pilot/tabs-permission"; granted: boolean }
  | { type: "context-pilot/tab-access"; tabId: number; granted: boolean }
  | { type: "context-pilot/page-snapshot"; taskId: string; snapshot: PageSnapshot }
  | { type: "context-pilot/error"; code: string; message: string };
