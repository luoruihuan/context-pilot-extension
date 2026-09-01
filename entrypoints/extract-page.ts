import { defineUnlistedScript } from "wxt/sandbox";

import {
  clearExtractionMetadata,
  readExtractionMetadata,
} from "@/services/browser/extraction-metadata";
import { extractPage } from "@/services/extraction";

export default defineUnlistedScript(async () => {
  const target = globalThis as unknown as Record<string, unknown>;
  const metadata = readExtractionMetadata(target);

  try {
    return await extractPage({
      tabId: metadata.tabId,
      sourceId: metadata.sourceId,
      taskId: metadata.taskId,
      document,
      locationHref: location.href,
      getCurrentLocationHref: () => location.href,
      getCurrentTaskId: () =>
        readExtractionMetadata(target, metadata.taskId).taskId,
    });
  } finally {
    clearExtractionMetadata(target, metadata.taskId);
  }
});
