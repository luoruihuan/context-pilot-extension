import type { ChromeAdapter } from "@/services/browser/chrome-adapter";
import { validateModelBaseUrl } from "@/services/llm/url-policy";

const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function originPatternForPage(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid page URL");
  }

  const isLocalHttp =
    url.protocol === "http:" && LOCAL_HTTP_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new Error("Page URL must use HTTPS or local HTTP");
  }
  if (url.username || url.password) {
    throw new Error("Page URL must not contain credentials");
  }

  return `${url.protocol}//${url.host}/*`;
}

export class PermissionService {
  constructor(private readonly chrome: ChromeAdapter) {}

  hasTabsPermission(): Promise<boolean> {
    return this.chrome.containsPermissions({ permissions: ["tabs"] });
  }

  requestTabsPermission(): Promise<boolean> {
    return this.chrome.requestPermissions({ permissions: ["tabs"] });
  }

  hasPageOrigin(pageUrl: string): Promise<boolean> {
    return this.chrome.containsPermissions({
      origins: [originPatternForPage(pageUrl)],
    });
  }

  requestPageOrigin(pageUrl: string): Promise<boolean> {
    return this.chrome.requestPermissions({
      origins: [originPatternForPage(pageUrl)],
    });
  }

  hasOriginPermission(baseUrl: string): Promise<boolean> {
    return this.chrome.containsPermissions({
      origins: [validateModelBaseUrl(baseUrl).originPattern],
    });
  }

  requestOriginPermission(baseUrl: string): Promise<boolean> {
    return this.chrome.requestPermissions({
      origins: [validateModelBaseUrl(baseUrl).originPattern],
    });
  }
}
