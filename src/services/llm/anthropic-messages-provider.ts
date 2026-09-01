import type { ChatRequest, ChatStreamEvent, ModelProfile } from "@/shared/types/domain";
import { endpointUrl, validateModelBaseUrl } from "@/services/llm/url-policy";
import {
  fetchError,
  httpError,
  responseErrorDetail,
  streamError,
  unsupportedResponseError,
} from "@/services/llm/provider";
import type { ModelProvider } from "@/services/llm/provider";
import type { SseEvent } from "@/services/llm/sse";
import { parseSse } from "@/services/llm/sse";

interface AnthropicEvent {
  type?: string;
  delta?: { type?: string; text?: string; stop_reason?: string | null };
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

export class AnthropicMessagesProvider implements ModelProvider {
  async testConnection(profile: ModelProfile, signal: AbortSignal): Promise<void> {
    let response: Response;
    try {
      response = await fetch(endpointUrl(profile.baseUrl, "/v1/models"), {
        headers: this.headers(profile),
        signal,
      });
    } catch (error) {
      throw fetchError(error, "anthropic-messages", signal);
    }
    if (!response.ok) throw httpError(response.status, "anthropic-messages", response.headers.get("request-id") ?? undefined);
  }

  async *streamChat(profile: ModelProfile, request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    if (request.signal.aborted) {
      yield {
        type: "error",
        error: fetchError(new DOMException("Aborted", "AbortError"), "anthropic-messages", request.signal),
      };
      return;
    }

    let response: Response;
    try {
      response = await fetch(endpointUrl(profile.baseUrl, "/v1/messages"), {
        method: "POST",
        headers: this.headers(profile),
        body: JSON.stringify({
          model: request.model,
          system: request.system,
          messages: request.messages,
          max_tokens: request.maxOutputTokens,
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
          stream: true,
        }),
        signal: request.signal,
      });
    } catch (error) {
      yield { type: "error", error: fetchError(error, "anthropic-messages", request.signal) };
      return;
    }

    const requestId = response.headers.get("request-id") ?? undefined;
    if (!response.ok) {
      yield {
        type: "error",
        error: httpError(
          response.status,
          "anthropic-messages",
          requestId,
          await responseErrorDetail(response),
        ),
      };
      return;
    }
    if (response.body === null) {
      yield { type: "error", error: streamError("anthropic-messages", undefined, requestId) };
      return;
    }

    let completed = false;
    try {
      for await (const event of parseSse(response.body)) {
        if (request.signal.aborted) {
          yield { type: "error", error: fetchError(new DOMException("Aborted", "AbortError"), "anthropic-messages", request.signal) };
          return;
        }
        const parsed = parseAnthropicEvent(event);
        if (parsed === undefined) continue;
        if (event.event === "error" || parsed.type === "error") {
          yield { type: "error", error: streamError("anthropic-messages", parsed.error?.message, requestId) };
          return;
        }
        if (event.event === "message_start" || parsed.type === "message_start") {
          const usage = parsed.message?.usage;
          if (usage !== undefined) {
            yield {
              type: "usage",
              ...(usage.input_tokens === undefined ? {} : { inputTokens: usage.input_tokens }),
              ...(usage.output_tokens === undefined ? {} : { outputTokens: usage.output_tokens }),
            };
          }
          continue;
        }
        if (event.event === "content_block_delta" || parsed.type === "content_block_delta") {
          if (parsed.delta?.type === "text_delta" && parsed.delta.text !== undefined) {
            yield { type: "text-delta", text: parsed.delta.text };
          }
          continue;
        }
        if (event.event === "message_delta" || parsed.type === "message_delta") {
          const usage = parsed.usage ?? parsed.message?.usage;
          if (usage !== undefined) {
            yield {
              type: "usage",
              ...(usage.input_tokens === undefined ? {} : { inputTokens: usage.input_tokens }),
              ...(usage.output_tokens === undefined ? {} : { outputTokens: usage.output_tokens }),
            };
          }
          continue;
        }
        if (event.event === "message_stop" || parsed.type === "message_stop") {
          completed = true;
          break;
        }
      }
      if (completed) {
        yield { type: "done", finishReason: "stop" };
      } else {
        yield { type: "error", error: unsupportedResponseError("anthropic-messages", requestId) };
      }
    } catch (error) {
      yield { type: "error", error: fetchError(error, "anthropic-messages", request.signal) };
    }
  }

  private headers(profile: ModelProfile): HeadersInit {
    const headers: Record<string, string> = {
      "x-api-key": profile.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      accept: "text/event-stream",
    };
    if (validateModelBaseUrl(profile.baseUrl).url.origin === "https://api.anthropic.com") {
      headers["anthropic-dangerous-direct-browser-access"] = "true";
    }
    return headers;
  }
}

function parseAnthropicEvent(event: SseEvent): AnthropicEvent | undefined {
  try {
    const parsed: unknown = JSON.parse(event.data);
    return typeof parsed === "object" && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}
