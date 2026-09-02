import { describe, expect, it, vi } from "vitest";
import type { ChatRequest, ModelProfile } from "@/shared/types/domain";
import { OpenAIChatProvider } from "@/services/llm/openai-chat-provider";
import { getProvider } from "@/services/llm/provider-registry";

const encoder = new TextEncoder();

function profile(): ModelProfile {
  return {
    id: "openai",
    name: "OpenAI",
    provider: "openai-chat",
    baseUrl: "https://gateway.example/v1",
    apiKey: "test-openai-key",
    model: "gpt-test",
    maxOutputTokens: 250,
    temperature: 0.2,
    isDefault: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function request(signal = new AbortController().signal): ChatRequest {
  return {
    model: "gpt-test",
    system: "Follow the system instruction.",
    messages: [{ role: "user", content: "Hello" }],
    maxOutputTokens: 250,
    temperature: 0.2,
    signal,
  };
}

function sseResponse(chunks: string[], status = 200): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { status, headers: { "content-type": "text/event-stream" } },
  );
}

async function collect(provider: OpenAIChatProvider, input: ChatRequest) {
  const events = [];
  for await (const event of provider.streamChat(profile(), input)) {
    events.push(event);
  }
  return events;
}

describe("OpenAIChatProvider", () => {
  it("tests the configured Chat Completions endpoint instead of requiring /models", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new OpenAIChatProvider().testConnection(profile(), new AbortController().signal)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends Chat Completions request and emits split text and usage", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      sseResponse([
        "data: {\"choices\":[{\"delta\":{\"con",
        "tent\":\"Hi\"},\"finish_reason\":null}]}\r\n\r\ndata: {\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":1},\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\r\n\r\ndata: [DONE]\r\n\r\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(collect(new OpenAIChatProvider(), request())).resolves.toEqual([
      { type: "text-delta", text: "Hi" },
      { type: "usage", inputTokens: 3, outputTokens: 1 },
      { type: "done", finishReason: "stop" },
    ]);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://gateway.example/v1/chat/completions");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer test-openai-key",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "gpt-test",
      messages: [
        { role: "system", content: "Follow the system instruction." },
        { role: "user", content: "Hello" },
      ],
      max_tokens: 250,
      temperature: 0.2,
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it("reports an unsupported response when the stream ends without DONE", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(sseResponse([
      "data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n",
    ])));

    await expect(collect(new OpenAIChatProvider(), request())).resolves.toEqual([
      { type: "text-delta", text: "partial" },
      expect.objectContaining({
        type: "error",
        error: expect.objectContaining({ code: "UNSUPPORTED_RESPONSE" }),
      }),
    ]);
  });

  it.each([
    [401, "AUTH_INVALID"],
    [404, "MODEL_NOT_FOUND"],
    [429, "RATE_LIMITED"],
  ] as const)("normalizes HTTP %i to %s without leaking credentials", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("invalid test-openai-key", { status })));

    const events = await collect(new OpenAIChatProvider(), request());

    expect(events).toEqual([
      expect.objectContaining({ type: "error", error: expect.objectContaining({ code, status }) }),
    ]);
    expect(JSON.stringify(events)).not.toContain("test-openai-key");
  });

  it("normalizes context length errors returned before streaming begins", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response('{"error":{"message":"maximum context length exceeded"}}', { status: 400 }),
      ),
    );

    await expect(collect(new OpenAIChatProvider(), request())).resolves.toEqual([
      expect.objectContaining({
        type: "error",
        error: expect.objectContaining({ code: "CONTEXT_TOO_LARGE", status: 400 }),
      }),
    ]);
  });

  it("normalizes context length JSON errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        sseResponse([
          "data: {\"error\":{\"message\":\"maximum context length exceeded\",\"type\":\"invalid_request_error\"}}\n\n",
        ]),
      ),
    );

    await expect(collect(new OpenAIChatProvider(), request())).resolves.toEqual([
      expect.objectContaining({
        type: "error",
        error: expect.objectContaining({ code: "CONTEXT_TOO_LARGE" }),
      }),
    ]);
  });

  it("normalizes network and abort failures", async () => {
    const networkFailure = new TypeError("network unavailable");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValueOnce(networkFailure));
    const controller = new AbortController();
    const networkEvents = await collect(new OpenAIChatProvider(), request(controller.signal));

    controller.abort();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValueOnce(new DOMException("Aborted", "AbortError")));
    const abortedEvents = await collect(new OpenAIChatProvider(), request(controller.signal));

    expect(networkEvents).toEqual([
      expect.objectContaining({ type: "error", error: expect.objectContaining({ code: "NETWORK_ERROR" }) }),
    ]);
    expect(abortedEvents).toEqual([
      expect.objectContaining({ type: "error", error: expect.objectContaining({ code: "ABORTED" }) }),
    ]);
  });

  it("normalizes test connection network and abort failures", async () => {
    const provider = new OpenAIChatProvider();
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("offline")));
    await expect(provider.testConnection(profile(), controller.signal)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      provider: "openai-chat",
    });

    controller.abort();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValueOnce(new DOMException("Aborted", "AbortError")));
    await expect(provider.testConnection(profile(), controller.signal)).rejects.toMatchObject({
      code: "ABORTED",
      provider: "openai-chat",
    });
  });

  it("registers the OpenAI provider by its domain kind", () => {
    expect(getProvider("openai-chat")).toBeInstanceOf(OpenAIChatProvider);
  });
});
