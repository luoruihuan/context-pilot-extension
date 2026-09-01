import { describe, expect, it, vi } from "vitest";
import type { ChatRequest, ModelProfile } from "@/shared/types/domain";
import { AnthropicMessagesProvider } from "@/services/llm/anthropic-messages-provider";

const encoder = new TextEncoder();

function profile(baseUrl = "https://api.anthropic.com"): ModelProfile {
  return {
    id: "anthropic",
    name: "Anthropic",
    provider: "anthropic-messages",
    baseUrl,
    apiKey: "test-anthropic-key",
    model: "claude-test",
    maxOutputTokens: 300,
    isDefault: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function request(signal = new AbortController().signal): ChatRequest {
  return {
    model: "claude-test",
    system: "Use sources only.",
    messages: [{ role: "user", content: "Summarize" }],
    maxOutputTokens: 300,
    signal,
  };
}

function sseResponse(chunks: string[]): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

async function collect(provider: AnthropicMessagesProvider, input: ChatRequest, modelProfile = profile()) {
  const events = [];
  for await (const event of provider.streamChat(modelProfile, input)) {
    events.push(event);
  }
  return events;
}

describe("AnthropicMessagesProvider", () => {
  it("sends Messages request and emits text, usage, and completion", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      sseResponse([
        "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":9}}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hi\"}}\n\n",
        "event: message_delta\ndata: {\"type\":\"message_delta\",\"usage\":{\"output_tokens\":1}}\n\nevent: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(collect(new AnthropicMessagesProvider(), request())).resolves.toEqual([
      { type: "usage", inputTokens: 9 },
      { type: "text-delta", text: "Hi" },
      { type: "usage", outputTokens: 1 },
      { type: "done", finishReason: "stop" },
    ]);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init?.headers).toMatchObject({
      "x-api-key": "test-anthropic-key",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "claude-test",
      system: "Use sources only.",
      messages: [{ role: "user", content: "Summarize" }],
      max_tokens: 300,
      stream: true,
    });
  });

  it("reports an unsupported response when the stream ends without message_stop", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(sseResponse([
      "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"partial\"}}\n\n",
    ])));

    await expect(collect(new AnthropicMessagesProvider(), request())).resolves.toEqual([
      { type: "text-delta", text: "partial" },
      expect.objectContaining({
        type: "error",
        error: expect.objectContaining({ code: "UNSUPPORTED_RESPONSE" }),
      }),
    ]);
  });

  it("does not send the browser access header to a compatible gateway", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(sseResponse(["event: message_stop\ndata: {}\n\n"]));
    vi.stubGlobal("fetch", fetchMock);

    await collect(new AnthropicMessagesProvider(), request(), profile("https://gateway.example"));

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.headers).not.toHaveProperty("anthropic-dangerous-direct-browser-access");
  });

  it("normalizes rate limits, context errors, and network failures", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 429 })));
    const rateLimited = await collect(new AnthropicMessagesProvider(), request());

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        sseResponse([
          "event: error\ndata: {\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"prompt is too long\"}}\n\n",
        ]),
      ),
    );
    const contextTooLarge = await collect(new AnthropicMessagesProvider(), request());

    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline")));
    const networkFailure = await collect(new AnthropicMessagesProvider(), request());

    expect(rateLimited).toEqual([
      expect.objectContaining({ type: "error", error: expect.objectContaining({ code: "RATE_LIMITED", status: 429 }) }),
    ]);
    expect(contextTooLarge).toEqual([
      expect.objectContaining({ type: "error", error: expect.objectContaining({ code: "CONTEXT_TOO_LARGE" }) }),
    ]);
    expect(networkFailure).toEqual([
      expect.objectContaining({ type: "error", error: expect.objectContaining({ code: "NETWORK_ERROR" }) }),
    ]);
  });

  it.each([
    [401, "AUTH_INVALID"],
    [404, "MODEL_NOT_FOUND"],
  ] as const)("normalizes HTTP %i to %s", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status })));

    await expect(collect(new AnthropicMessagesProvider(), request())).resolves.toEqual([
      expect.objectContaining({ type: "error", error: expect.objectContaining({ code, status }) }),
    ]);
  });

  it("normalizes a context error returned before streaming begins", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response('{"error":{"message":"prompt is too long"}}', { status: 400 }),
      ),
    );

    await expect(collect(new AnthropicMessagesProvider(), request())).resolves.toEqual([
      expect.objectContaining({
        type: "error",
        error: expect.objectContaining({ code: "CONTEXT_TOO_LARGE", status: 400 }),
      }),
    ]);
  });

  it("normalizes an aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());

    await expect(collect(new AnthropicMessagesProvider(), request(controller.signal))).resolves.toEqual([
      expect.objectContaining({ type: "error", error: expect.objectContaining({ code: "ABORTED" }) }),
    ]);
  });

  it("normalizes test connection network and abort failures", async () => {
    const provider = new AnthropicMessagesProvider();
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("offline")));
    await expect(provider.testConnection(profile(), controller.signal)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      provider: "anthropic-messages",
    });

    controller.abort();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValueOnce(new DOMException("Aborted", "AbortError")));
    await expect(provider.testConnection(profile(), controller.signal)).rejects.toMatchObject({
      code: "ABORTED",
      provider: "anthropic-messages",
    });
  });
});
