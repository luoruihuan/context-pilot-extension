import type {
  ChatRequest,
  ChatStreamEvent,
  ModelProfile,
  ProviderError,
  ProviderKind,
} from "@/shared/types/domain";

export interface ModelProvider {
  testConnection(profile: ModelProfile, signal: AbortSignal): Promise<void>;
  streamChat(profile: ModelProfile, request: ChatRequest): AsyncIterable<ChatStreamEvent>;
}

export function providerError(
  code: ProviderError["code"],
  provider: ProviderKind,
  options: { status?: number; requestId?: string } = {},
): ProviderError {
  return {
    code,
    message: errorMessage(code),
    provider,
    ...(options.status === undefined ? {} : { status: options.status }),
    ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
  };
}

export function httpError(
  status: number,
  provider: ProviderKind,
  requestId?: string,
  detail?: string,
): ProviderError {
  return providerError(errorCodeFor(status, detail), provider, { status, requestId });
}

export function streamError(
  provider: ProviderKind,
  detail?: string,
  requestId?: string,
): ProviderError {
  return providerError(errorCodeFor(undefined, detail), provider, { requestId });
}

export function unsupportedResponseError(
  provider: ProviderKind,
  requestId?: string,
): ProviderError {
  return providerError("UNSUPPORTED_RESPONSE", provider, { requestId });
}

export function fetchError(error: unknown, provider: ProviderKind, signal: AbortSignal): ProviderError {
  if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
    return providerError("ABORTED", provider);
  }

  return providerError("NETWORK_ERROR", provider);
}

export async function responseErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const payload: unknown = await response.json();
    return errorMessageFromPayload(payload);
  } catch {
    return undefined;
  }
}

function errorCodeFor(status?: number, detail?: string): ProviderError["code"] {
  if (status === 401) return "AUTH_INVALID";
  if (status === 403) return "PERMISSION_REQUIRED";
  if (status === 404) return "MODEL_NOT_FOUND";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status === 429) return "RATE_LIMITED";
  if (status !== undefined && status >= 500) return "NETWORK_ERROR";

  const normalizedDetail = detail?.toLowerCase() ?? "";
  if (
    normalizedDetail.includes("context length") ||
    normalizedDetail.includes("prompt is too long") ||
    normalizedDetail.includes("too many tokens")
  ) {
    return "CONTEXT_TOO_LARGE";
  }
  if (normalizedDetail.includes("quota") || normalizedDetail.includes("credit balance")) {
    return "QUOTA_EXCEEDED";
  }

  return status === undefined ? "UNKNOWN" : "UNKNOWN";
}

function errorMessageFromPayload(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  if (typeof payload.message === "string") return payload.message;
  if (!isRecord(payload.error)) return undefined;
  return typeof payload.error.message === "string" ? payload.error.message : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(code: ProviderError["code"]): string {
  const messages: Record<ProviderError["code"], string> = {
    AUTH_INVALID: "The API key was rejected.",
    PERMISSION_REQUIRED: "The API key does not have permission for this request.",
    RATE_LIMITED: "The provider rate limit was reached. Try again later.",
    QUOTA_EXCEEDED: "The provider quota has been exceeded.",
    MODEL_NOT_FOUND: "The configured model was not found.",
    CONTEXT_TOO_LARGE: "The selected context is too large for this model.",
    NETWORK_ERROR: "The provider could not be reached.",
    TIMEOUT: "The provider request timed out.",
    UNSUPPORTED_RESPONSE: "The provider returned an unsupported response.",
    ABORTED: "The request was stopped.",
    UNKNOWN: "The provider returned an unexpected error.",
  };

  return messages[code];
}
