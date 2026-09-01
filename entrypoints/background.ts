import { defineBackground } from "wxt/sandbox";

export default defineBackground(() => {
  void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(
    (error: unknown) => {
      console.error("Unable to configure side panel behavior", error);
    },
  );
});
