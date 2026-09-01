export const EXTRACTION_METADATA_KEY = "__contextPilotExtraction";

export interface ExtractionMetadata {
  tabId: number;
  taskId: string;
  sourceId: string;
  claimed?: boolean;
}

function isMetadata(value: unknown): value is ExtractionMetadata {
  if (typeof value !== "object" || value === null) return false;
  const metadata = value as Partial<ExtractionMetadata>;
  return (
    Number.isSafeInteger(metadata.tabId) &&
    typeof metadata.tabId === "number" &&
    metadata.tabId > 0 &&
    typeof metadata.taskId === "string" &&
    metadata.taskId.length > 0 &&
    metadata.taskId.length <= 128 &&
    typeof metadata.sourceId === "string" &&
    metadata.sourceId.length > 0
  );
}

export function readExtractionMetadata(
  target: Record<string, unknown>,
  expectedTaskId?: string,
): ExtractionMetadata {
  const value = target[EXTRACTION_METADATA_KEY];
  if (isMetadata(value)) {
    if (expectedTaskId && value.taskId !== expectedTaskId) {
      throw new Error("Extraction task is stale");
    }
    return value;
  }
  if (typeof value !== "object" || value === null) {
    throw new Error("Extraction metadata is missing");
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, candidate]) => isMetadata(candidate)) as Array<[string, ExtractionMetadata]>;
  const entry = expectedTaskId
    ? entries.find(([taskId, metadata]) => taskId === expectedTaskId && metadata.taskId === expectedTaskId)
    : entries.find(([, metadata]) => metadata.claimed !== true);
  if (!entry) {
    throw new Error(expectedTaskId ? "Extraction task is stale" : "Extraction metadata is missing");
  }
  entry[1].claimed = true;

  return entry[1];
}

export function clearExtractionMetadata(target: Record<string, unknown>, taskId: string): void {
  const value = target[EXTRACTION_METADATA_KEY];
  if (isMetadata(value)) {
    if (value.taskId === taskId) delete target[EXTRACTION_METADATA_KEY];
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const metadataMap = value as Record<string, unknown>;
  const candidate = metadataMap[taskId];
  if (isMetadata(candidate) && candidate.taskId === taskId) {
    delete metadataMap[taskId];
  }
  if (Object.keys(metadataMap).length === 0) delete target[EXTRACTION_METADATA_KEY];
}
