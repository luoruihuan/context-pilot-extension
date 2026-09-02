import type { ChatRequest, ChatStreamEvent, ModelProfile } from "@/shared/types/domain";
import { endpointUrl } from "@/services/llm/url-policy";
import {
  fetchError,
  httpError,
  responseErrorDetail,
  streamError,
  unsupportedResponseError,
} from "@/services/llm/provider";
import type { ModelProvider } from "@/services/llm/provider";
import { parseSse } from "@/services/llm/sse";

interface OpenAiChunk {
  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export class OpenAIChatProvider implements ModelProvider {
  async testConnection(profile: ModelProfile, signal: AbortSignal): Promise<void> {
    let response: Response;
    try {
      response = await fetch(endpointUrl(profile.baseUrl, "/chat/completions"), {
        method: "POST",
        headers: {
          authorization: `Bearer ${profile.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: profile.model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
          stream: false,
        }),
        signal,
      });
    } catch (error) {
      throw fetchError(error, "openai-chat", signal);
    }
    if (!response.ok) throw httpError(response.status, "openai-chat", response.headers.get("x-request-id") ?? undefined);
  }

  async *streamChat(profile: ModelProfile, request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    if (request.signal.aborted) {
      yield { type: "error", error: fetchError(new DOMException("Aborted", "AbortError"), "openai-chat", request.signal) };
      return;
    }

    let response: Response;
    try {
      response = await fetch(endpointUrl(profile.baseUrl, "/chat/completions"), {
        method: "POST",
        headers: {
          authorization: `Bearer ${profile.apiKey}`,
          "content-type": "application/json",
          accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: request.model,
          messages: [{ role: "system", content: request.system }, ...request.messages],
          max_tokens: request.maxOutputTokens,
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: request.signal,
      });
    } catch (error) {
      yield { type: "error", error: fetchError(error, "openai-chat", request.signal) };
      return;
    }

    const requestId = response.headers.get("x-request-id") ?? undefined;
    if (!response.ok) {
      yield {
        type: "error",
        error: httpError(response.status, "openai-chat", requestId, await responseErrorDetail(response)),
      };
      return;
    }
    if (response.body === null) {
      yield { type: "error", error: streamError("openai-chat", undefined, requestId) };
      return;
    }

    let finishReason: string | undefined;
    let completed = false;
    try {
      for await (const event of parseSse(response.body)) {
        if (request.signal.aborted) {
          yield { type: "error", error: fetchError(new DOMException("Aborted", "AbortError"), "openai-chat", request.signal) };
          return;
        }
        if (event.data === "[DONE]") {
          completed = true;
          break;
        }

        const chunk = parseOpenAiChunk(event.data);
        if (chunk === undefined) continue;
        if (chunk.error !== undefined) {
          yield { type: "error", error: streamError("openai-chat", chunk.error.message, requestId) };
          return;
        }
        const choice = chunk.choices?.[0];
        if (choice?.delta?.content !== undefined) yield { type: "text-delta", text: choice.delta.content };
        if (choice?.finish_reason !== undefined && choice.finish_reason !== null) finishReason = choice.finish_reason;
        if (chunk.usage !== undefined) {
          yield {
            type: "usage",
            ...(chunk.usage.prompt_tokens === undefined ? {} : { inputTokens: chunk.usage.prompt_tokens }),
            ...(chunk.usage.completion_tokens === undefined ? {} : { outputTokens: chunk.usage.completion_tokens }),
          };
        }
      }
      if (completed) {
        yield { type: "done", ...(finishReason === undefined ? {} : { finishReason }) };
      } else {
        yield { type: "error", error: unsupportedResponseError("openai-chat", requestId) };
      }
    } catch (error) {
      yield { type: "error", error: fetchError(error, "openai-chat", request.signal) };
    }
  }
}

function parseOpenAiChunk(data: string): OpenAiChunk | undefined {
  try {
    const parsed: unknown = JSON.parse(data);
    return isOpenAiChunk(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isOpenAiChunk(value: unknown): value is OpenAiChunk {
  return typeof value === "object" && value !== null;
}
