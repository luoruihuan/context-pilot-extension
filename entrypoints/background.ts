import { defineBackground } from "wxt/sandbox";

import { BackgroundMessageRouter } from "@/services/browser/background-router";
import { BrowserChromeAdapter } from "@/services/browser/chrome-adapter";
import { PermissionService } from "@/services/browser/permission-service";
import { TabService } from "@/services/browser/tab-service";

export default defineBackground(() => {
  void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(
    (error: unknown) => {
      console.error("Unable to configure side panel behavior", error);
    },
  );

  const adapter = new BrowserChromeAdapter();
  const permissions = new PermissionService(adapter);
  const router = new BackgroundMessageRouter(
    chrome.runtime.id,
    new TabService(adapter, permissions),
    permissions,
    adapter,
  );

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    void router.handle(request, sender).then(sendResponse);
    return true;
  });
});
