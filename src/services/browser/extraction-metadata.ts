export const EXTRACTION_METADATA_KEY = "__contextPilotExtraction";

export interface ExtractionMetadata {
  tabId: number;
  taskId: string;
  sourceId: string;
}

export function readExtractionMetadata(
  target: Record<string, unknown>,
  expectedTaskId?: string,
): ExtractionMetadata {
  const value = target[EXTRACTION_METADATA_KEY];
  if (typeof value !== "object" || value === null) {
    throw new Error("Extraction metadata is missing");
  }

  const metadata = value as Partial<ExtractionMetadata>;
  if (
    !Number.isSafeInteger(metadata.tabId) ||
    typeof metadata.tabId !== "number" ||
    metadata.tabId <= 0 ||
    typeof metadata.taskId !== "string" ||
    metadata.taskId.length === 0 ||
    metadata.taskId.length > 128 ||
    typeof metadata.sourceId !== "string" ||
    metadata.sourceId.length === 0
  ) {
    throw new Error("Extraction metadata is invalid");
  }
  if (expectedTaskId && metadata.taskId !== expectedTaskId) {
    throw new Error("Extraction task is stale");
  }

  return {
    tabId: metadata.tabId,
    taskId: metadata.taskId,
    sourceId: metadata.sourceId,
  };
}
