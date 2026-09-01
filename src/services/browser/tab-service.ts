import type { ChromeAdapter } from "@/services/browser/chrome-adapter";
import {
  originPatternForPage,
  type PermissionService,
} from "@/services/browser/permission-service";
import type { TabReference } from "@/shared/types/domain";

export class RestrictedPageError extends Error {
  readonly code = "RESTRICTED_PAGE";
}

export class TabNotFoundError extends Error {
  readonly code = "TAB_NOT_FOUND";
}

function pageUrl(tab: chrome.tabs.Tab): URL | null {
  if (!tab.url) {
    return null;
  }

  try {
    originPatternForPage(tab.url);
    return new URL(tab.url);
  } catch {
    return null;
  }
}

export class TabService {
  constructor(
    private readonly chrome: ChromeAdapter,
    private readonly permissions: PermissionService,
  ) {}

  async listTabs(): Promise<TabReference[]> {
    const tabs = await this.chrome.queryTabs({ currentWindow: true });
    const references = await Promise.all(
      tabs.map(async (tab): Promise<TabReference | null> => {
        const url = pageUrl(tab);
        if (tab.id === undefined || tab.windowId === undefined) {
          return null;
        }

        if (!url) {
          const restrictedUrl = tab.url ?? "";
          return {
            tabId: tab.id,
            windowId: tab.windowId,
            title: tab.title?.trim() || "受限页面",
            url: restrictedUrl,
            origin: "",
            ...(tab.favIconUrl ? { favIconUrl: tab.favIconUrl } : {}),
            isCurrent: tab.active === true,
            permission: "restricted",
          };
        }

        const isCurrent = tab.active === true;
        const granted =
          (await this.permissions.hasPageOrigin(url.href)) ||
          (isCurrent && (await this.chrome.canAccessTab(tab.id)));
        return {
          tabId: tab.id,
          windowId: tab.windowId,
          title: tab.title?.trim() || url.hostname,
          url: url.href,
          origin: url.origin,
          ...(tab.favIconUrl ? { favIconUrl: tab.favIconUrl } : {}),
          isCurrent,
          permission: granted ? "granted" : "required",
        };
      }),
    );

    return references
      .filter((tab): tab is TabReference => tab !== null)
      .sort((left, right) => Number(right.isCurrent) - Number(left.isCurrent));
  }

  async requireReadableTab(tabId: number): Promise<chrome.tabs.Tab> {
    let tab: chrome.tabs.Tab;
    try {
      tab = await this.chrome.getTab(tabId);
    } catch {
      throw new TabNotFoundError("The selected tab is no longer available");
    }

    if (!pageUrl(tab)) {
      throw new RestrictedPageError("This page cannot be read");
    }
    return tab;
  }

  async hasReadAccess(tab: chrome.tabs.Tab): Promise<boolean> {
    if (await this.permissions.hasPageOrigin(tab.url ?? "")) return true;
    return tab.active === true && tab.id !== undefined && this.chrome.canAccessTab(tab.id);
  }
}
