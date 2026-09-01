import { z } from "zod";

import type { ChromeAdapter } from "@/services/browser/chrome-adapter";
import type { PermissionService } from "@/services/browser/permission-service";
import {
  RestrictedPageError,
  TabNotFoundError,
  type TabService,
} from "@/services/browser/tab-service";
import { pageSnapshotSchema } from "@/shared/types/domain";
import type {
  ExtensionRequest,
  ExtensionResponse,
} from "@/shared/types/messages";

const requestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("context-pilot/get-tabs") }).strict(),
  z.object({ type: z.literal("context-pilot/request-tabs-permission") }).strict(),
  z.object({ type: z.literal("context-pilot/request-origin-permission"), baseUrl: z.string().max(2048) }).strict(),
  z
    .object({
      type: z.literal("context-pilot/request-tab-access"),
      tabId: z.number().int().positive(),
      origin: z.string().max(2048),
    })
    .strict(),
  z
    .object({
      type: z.literal("context-pilot/extract-page"),
      tabId: z.number().int().positive(),
      taskId: z.string().min(1).max(128),
    })
    .strict(),
]);

export interface MessageSenderIdentity {
  id?: string;
}

function error(code: string, message: string): ExtensionResponse {
  return { type: "context-pilot/error", code, message };
}

function isPermissionInjectionError(caught: unknown): boolean {
  const message = caught instanceof Error ? caught.message : String(caught);
  return /cannot access|permission|not allowed|cannot be scripted/i.test(message);
}

export class BackgroundMessageRouter {
  constructor(
    private readonly extensionId: string,
    private readonly tabs: TabService,
    private readonly permissions: PermissionService,
    private readonly chrome: ChromeAdapter,
  ) {}

  async handle(
    input: unknown,
    sender: MessageSenderIdentity,
  ): Promise<ExtensionResponse> {
    if (sender.id !== this.extensionId) {
      return error("INVALID_SENDER", "Message sender is not trusted");
    }

    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) {
      return error("INVALID_REQUEST", "Message request is invalid");
    }
    const request: ExtensionRequest = parsed.data;

    try {
      switch (request.type) {
        case "context-pilot/get-tabs":
          return { type: "context-pilot/tabs", tabs: await this.tabs.listTabs() };
        case "context-pilot/request-tabs-permission":
          return {
            type: "context-pilot/tabs-permission",
            granted:
              (await this.permissions.hasTabsPermission()) ||
              (await this.permissions.requestTabsPermission()),
          };
        case "context-pilot/request-origin-permission": {
          return {
            type: "context-pilot/origin-permission",
            granted:
              (await this.permissions.hasOriginPermission(request.baseUrl)) ||
              (await this.permissions.requestOriginPermission(request.baseUrl)),
          };
        }
        case "context-pilot/request-tab-access": {
          const tab = await this.tabs.requireReadableTab(request.tabId);
          const granted =
            (await this.tabs.hasReadAccess(tab)) ||
            (await this.permissions.requestPageOrigin(tab.url ?? ""));
          return {
            type: "context-pilot/tab-access",
            tabId: request.tabId,
            granted,
          };
        }
        case "context-pilot/extract-page": {
          const tab = await this.tabs.requireReadableTab(request.tabId);
          if (!(await this.tabs.hasReadAccess(tab))) {
            return error("PERMISSION_REQUIRED", "Page access is required");
          }

          let rawSnapshot: unknown;
          try {
            rawSnapshot = await this.chrome.executeExtraction(request.tabId, request.taskId);
          } catch (caught) {
            if (isPermissionInjectionError(caught)) {
              return error("PERMISSION_REQUIRED", "Page access is required");
            }
            throw caught;
          }
          const snapshot = pageSnapshotSchema.safeParse(rawSnapshot);
          if (!snapshot.success || snapshot.data.tabId !== request.tabId) {
            return error("INVALID_SNAPSHOT", "Page extraction returned invalid data");
          }
          return {
            type: "context-pilot/page-snapshot",
            taskId: request.taskId,
            snapshot: snapshot.data,
          };
        }
      }
    } catch (caught) {
      if (caught instanceof RestrictedPageError) {
        return error(caught.code, caught.message);
      }
      if (caught instanceof TabNotFoundError) {
        return error(caught.code, caught.message);
      }
      return error("BROWSER_ERROR", "The browser operation failed");
    }
  }
}
