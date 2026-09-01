import { describe, expect, it, vi } from "vitest";

import {
  ChatController,
  type ChatControllerDependencies,
} from "@/features/chat/chat-controller";
import type { TabExtractionResult } from "@/services/browser/extraction-client";
import type { Conversation } from "@/services/storage";
import type {
  ChatStreamEvent,
  ModelProfile,
  PageSnapshot,
} from "@/shared/types/domain";

function snapshot(tabId: number, text: string): PageSnapshot {
  return {
    sourceId: `page-${tabId}`,
    tabId,
    title: `Title ${tabId}`,
    url: `https://example.com/${tabId}`,
    extractedAt: tabId,
    routeVersion: `route-${tabId}`,
    headings: [],
    paragraphs: [text],
    lists: [],
    tables: [],
    plainText: text,
    extractionMethod: "readability",
    truncated: false,
  };
}

const profile: ModelProfile = {
  id: "p1",
  name: "Model",
  provider: "openai-chat",
  baseUrl: "https://api.example.com/v1",
  apiKey: "secret-key",
  model: "test-model",
  maxOutputTokens: 500,
  temperature: 0.2,
  isDefault: true,
  createdAt: 1,
  updatedAt: 1,
};

async function* events(items: ChatStreamEvent[]): AsyncGenerator<ChatStreamEvent> {
  for (const item of items) yield item;
}

function setup(overrides: Partial<ChatControllerDependencies> = {}) {
  const extraction = {
    extractTabs: vi.fn().mockResolvedValue([
      { tabId: 1, status: "fulfilled", snapshot: snapshot(1, "Alpha") },
      { tabId: 2, status: "fulfilled", snapshot: snapshot(2, "Beta") },
    ]),
  };
  const provider = {
    testConnection: vi.fn(),
    streamChat: vi.fn().mockImplementation(() =>
      events([
        { type: "text-delta", text: "T1 与 " },
        { type: "text-delta", text: "T2 的比较结果" },
        { type: "usage", inputTokens: 12, outputTokens: 6 },
        { type: "done", finishReason: "stop" },
      ]),
    ),
  };
  const saved: Conversation[] = [];
  const conversations = {
    save: vi.fn(async (conversation: Conversation) => {
      saved.push(structuredClone(conversation));
    }),
  };
  const controller = new ChatController({
    extraction,
    getProfile: vi.fn().mockResolvedValue(profile),
    getProvider: vi.fn().mockReturnValue(provider),
    conversations,
    createId: (() => {
      let value = 0;
      return () => `id-${++value}`;
    })(),
    now: () => 100,
    ...overrides,
  });
  return { controller, extraction, provider, conversations, saved };
}

describe("ChatController", () => {
  it("continues when one selected tab cannot be extracted and assigns stable source numbers", async () => {
    const { controller, extraction, provider, saved } = setup();
    extraction.extractTabs.mockResolvedValue([
      { tabId: 1, status: "fulfilled", snapshot: snapshot(1, "Alpha") },
      { tabId: 2, status: "rejected", code: "TAB_DISCARDED", message: "Tab discarded" },
    ]);

    await controller.send({ text: "比较两个页面", tabIds: [1, 2], profileId: "p1" });

    expect(provider.streamChat).toHaveBeenCalledOnce();
    expect(controller.getState().sourceErrors).toEqual([
      { sourceId: "T2", tabId: 2, code: "TAB_DISCARDED", message: "Tab discarded" },
    ]);
    expect(controller.getState().turns.at(-1)).toMatchObject({
      content: "T1 与 T2 的比较结果",
      status: "complete",
      sources: [{ sourceId: "T1", title: "Title 1" }],
    });
    expect(saved).toHaveLength(1);
    expect(JSON.stringify(saved)).not.toContain("Alpha");
    expect(JSON.stringify(saved)).not.toContain("secret-key");
  });

  it("extracts every send again and accumulates stream deltas and usage", async () => {
    const { controller, extraction } = setup();

    await controller.send({ text: "第一次", tabIds: [1, 2], profileId: "p1" });
    await controller.send({ text: "第二次", tabIds: [1, 2], profileId: "p1" });

    expect(extraction.extractTabs).toHaveBeenNthCalledWith(1, [1, 2], expect.any(AbortSignal));
    expect(extraction.extractTabs).toHaveBeenNthCalledWith(2, [1, 2], expect.any(AbortSignal));
    expect(controller.getState()).toMatchObject({
      status: "complete",
      usage: { inputTokens: 12, outputTokens: 6 },
    });
    expect(controller.getState().turns.filter((turn) => turn.role === "assistant")).toHaveLength(2);
  });

  it("retries an assistant turn with its original question, tabs, and profile", async () => {
    const { controller, extraction } = setup();
    await controller.send({ text: "原问题", tabIds: [2, 1], profileId: "p1" });
    const assistantId = controller.getState().turns.at(-1)!.id;

    await controller.retry(assistantId);

    expect(extraction.extractTabs).toHaveBeenNthCalledWith(2, [2, 1], expect.any(AbortSignal));
    expect(controller.getState().turns.filter((turn) => turn.content === "原问题")).toHaveLength(2);
  });

  it("restores a persisted conversation as an idle chat that can continue", async () => {
    const { controller } = setup();
    const restored: Conversation = {
      id: "conversation-restored",
      turns: [
        { id: "u1", role: "user", content: "旧问题", sources: [], createdAt: 10, status: "complete" },
        { id: "a1", role: "assistant", content: "旧回答", sources: [], createdAt: 11, status: "complete" },
      ],
      createdAt: 10,
      updatedAt: 11,
    };

    controller.restore(restored);

    expect(controller.getState()).toEqual({
      status: "idle",
      turns: restored.turns,
      sourceErrors: [],
    });
    expect(controller.canRetry("a1")).toBe(false);
  });

  it("forgets a deleted current conversation identity before the next save", async () => {
    const { controller, saved } = setup();
    controller.restore({
      id: "deleted-conversation",
      turns: [
        { id: "u-old", role: "user", content: "旧问题", sources: [], createdAt: 1, status: "complete" },
      ],
      createdAt: 1,
      updatedAt: 1,
    });

    controller.forgetConversation("deleted-conversation");
    await controller.send({ text: "删除后继续", tabIds: [1], profileId: "p1" });

    expect(saved).toHaveLength(1);
    expect(saved[0]?.id).not.toBe("deleted-conversation");
    expect(JSON.stringify(saved[0])).not.toContain("旧问题");
  });

  it("does not clear the current conversation when another history item is deleted", async () => {
    const { controller, saved } = setup();
    controller.restore({
      id: "current-conversation",
      turns: [
        { id: "u-current", role: "user", content: "当前旧问题", sources: [], createdAt: 1, status: "complete" },
      ],
      createdAt: 1,
      updatedAt: 1,
    });

    controller.forgetConversation("another-conversation");
    await controller.send({ text: "继续当前会话", tabIds: [1], profileId: "p1" });

    expect(saved[0]?.id).toBe("current-conversation");
    expect(JSON.stringify(saved[0])).toContain("当前旧问题");
  });

  it("reports a context error when every page fails and retries extraction on the next send", async () => {
    const { controller, extraction, provider } = setup();
    extraction.extractTabs
      .mockResolvedValueOnce([
        { tabId: 1, status: "rejected", code: "TAB_NOT_FOUND", message: "Tab closed" },
      ])
      .mockResolvedValueOnce([
        { tabId: 1, status: "fulfilled", snapshot: snapshot(1, "Fresh content") },
      ]);

    await controller.send({ text: "第一次", tabIds: [1], profileId: "p1" });
    expect(controller.getState()).toMatchObject({
      status: "error",
      error: { code: "CONTEXT_UNAVAILABLE" },
      sourceErrors: [{ sourceId: "T1", tabId: 1, code: "TAB_NOT_FOUND" }],
    });

    await controller.send({ text: "重试", tabIds: [1], profileId: "p1" });

    expect(extraction.extractTabs).toHaveBeenCalledTimes(2);
    expect(provider.streamChat).toHaveBeenCalledOnce();
    expect(controller.getState().status).toBe("complete");
  });

  it("stops an active stream and keeps text already received", async () => {
    const { controller, provider, saved } = setup();
    provider.streamChat.mockImplementation(async function* (_profile, request) {
      yield { type: "text-delta", text: "已生成内容" };
      controller.stop();
      expect(request.signal.aborted).toBe(true);
      yield {
        type: "error",
        error: { code: "ABORTED", message: "The request was stopped.", provider: "openai-chat" },
      };
    });

    await controller.send({ text: "停止测试", tabIds: [1], profileId: "p1" });

    expect(controller.getState()).toMatchObject({ status: "stopped" });
    expect(controller.getState().turns.at(-1)).toMatchObject({
      content: "已生成内容",
      status: "stopped",
    });
    expect(saved.at(-1)?.turns.at(-1)).toMatchObject({
      content: "已生成内容",
      status: "stopped",
    });
  });

  it("does not let an extraction finishing after reset repopulate the new conversation", async () => {
    let finishExtraction: ((value: TabExtractionResult[]) => void) | undefined;
    const { controller, extraction, provider } = setup();
    extraction.extractTabs.mockReturnValue(
      new Promise((resolve) => {
        finishExtraction = resolve;
      }),
    );

    const sending = controller.send({ text: "旧问题", tabIds: [1], profileId: "p1" });
    await vi.waitFor(() => expect(controller.getState().status).toBe("extracting"));
    controller.reset();
    finishExtraction?.([
      { tabId: 1, status: "fulfilled", snapshot: snapshot(1, "Old content") },
    ]);
    await sending;

    expect(controller.getState()).toMatchObject({ status: "idle", turns: [] });
    expect(provider.streamChat).not.toHaveBeenCalled();
  });

  it("does not let an extraction rejection after reset overwrite the new conversation", async () => {
    let rejectExtraction: ((reason?: unknown) => void) | undefined;
    const { controller, extraction, provider } = setup();
    extraction.extractTabs.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectExtraction = reject;
      }),
    );

    const sending = controller.send({ text: "旧问题", tabIds: [1], profileId: "p1" });
    await vi.waitFor(() => expect(controller.getState().status).toBe("extracting"));
    controller.reset();
    rejectExtraction?.(new Error("Tab closed"));
    await sending;

    expect(controller.getState()).toMatchObject({ status: "idle", turns: [] });
    expect(provider.streamChat).not.toHaveBeenCalled();
  });

  it("keeps stopped state when extraction rejects after stop", async () => {
    let rejectExtraction: ((reason?: unknown) => void) | undefined;
    const { controller, extraction, provider } = setup();
    extraction.extractTabs.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectExtraction = reject;
      }),
    );

    const sending = controller.send({ text: "停止读取", tabIds: [1], profileId: "p1" });
    await vi.waitFor(() => expect(controller.getState().status).toBe("extracting"));
    controller.stop();
    rejectExtraction?.(new Error("Tab closed"));
    await sending;

    expect(controller.getState()).toMatchObject({ status: "stopped" });
    expect(provider.streamChat).not.toHaveBeenCalled();
  });

  it("retries a send that was stopped before extraction completed", async () => {
    const { controller, extraction, provider } = setup();
    extraction.extractTabs
      .mockImplementationOnce((_tabIds, signal) => new Promise((resolve) => {
        signal?.addEventListener("abort", () => resolve([]), { once: true });
      }))
      .mockResolvedValueOnce([
        { tabId: 1, status: "fulfilled", snapshot: snapshot(1, "Retried content") },
      ]);

    const firstSend = controller.send({ text: "停止后重试", tabIds: [1], profileId: "p1" });
    await vi.waitFor(() => expect(controller.getState().status).toBe("extracting"));
    const userTurnId = controller.getState().turns.at(-1)!.id;
    controller.stop();
    await firstSend;

    await controller.retry(userTurnId);

    expect(extraction.extractTabs).toHaveBeenCalledTimes(2);
    expect(provider.streamChat).toHaveBeenCalledOnce();
    expect(controller.getState().status).toBe("complete");
  });

  it("aborts a stopped extraction and lets a new send finish without the old run overwriting it", async () => {
    let finishOldExtraction: ((value: TabExtractionResult[]) => void) | undefined;
    const extraction = {
      extractTabs: vi.fn((tabIds: number[], signal?: AbortSignal) => {
        if (tabIds[0] === 1) {
          return new Promise<TabExtractionResult[]>((resolve) => {
            finishOldExtraction = resolve;
            signal?.addEventListener("abort", () => resolve([]), { once: true });
          });
        }
        return Promise.resolve([
          { tabId: 2, status: "fulfilled" as const, snapshot: snapshot(2, "Fresh content") },
        ]);
      }),
    };
    const { controller, provider } = setup({ extraction });

    const oldSend = controller.send({ text: "旧问题", tabIds: [1], profileId: "p1" });
    await vi.waitFor(() => expect(controller.getState().status).toBe("extracting"));
    controller.stop();
    expect(extraction.extractTabs.mock.calls[0]?.[1]?.aborted).toBe(true);

    const newSend = controller.send({ text: "新问题", tabIds: [2], profileId: "p1" });
    finishOldExtraction?.([
      { tabId: 1, status: "fulfilled", snapshot: snapshot(1, "Old content") },
    ]);
    await Promise.all([oldSend, newSend]);

    expect(provider.streamChat).toHaveBeenCalledOnce();
    expect(controller.getState().status).toBe("complete");
    expect(controller.getState().turns.some((turn) => turn.content === "新问题")).toBe(true);
    expect(JSON.stringify(controller.getState().turns)).not.toContain("Old content");
  });

  it.each(["CONTEXT_TOO_LARGE", "NETWORK_ERROR"] as const)(
    "surfaces %s provider errors without discarding the conversation",
    async (code) => {
      const { controller, provider } = setup();
      provider.streamChat.mockReturnValue(
        events([
          {
            type: "error",
            error: { code, message: `Provider failed: ${code}`, provider: "openai-chat" },
          },
        ]),
      );

      await controller.send({ text: "错误测试", tabIds: [1], profileId: "p1" });

      expect(controller.getState()).toMatchObject({
        status: "error",
        error: { code, message: `Provider failed: ${code}` },
      });
      expect(controller.getState().turns.at(-1)).toMatchObject({ status: "error" });
    },
  );

  it("leaves extracting state when the model profile cannot be loaded", async () => {
    const { controller, extraction } = setup({
      getProfile: vi.fn().mockRejectedValue(new Error("storage unavailable")),
    });

    await controller.send({ text: "配置错误", tabIds: [1], profileId: "p1" });

    expect(controller.getState()).toMatchObject({
      status: "error",
      error: { code: "MODEL_CONFIG_UNAVAILABLE" },
    });
    expect(extraction.extractTabs).not.toHaveBeenCalled();
  });

  it("keeps a generated answer visible when conversation persistence fails", async () => {
    const { controller } = setup({
      conversations: { save: vi.fn().mockRejectedValue(new Error("IndexedDB unavailable")) },
    });

    await expect(
      controller.send({ text: "保存失败", tabIds: [1], profileId: "p1" }),
    ).resolves.toBeUndefined();

    expect(controller.getState()).toMatchObject({
      status: "complete",
      persistenceWarning: "回答已生成，但历史记录未保存。",
    });
    expect(controller.getState().turns.at(-1)?.content).toContain("比较结果");
  });
});
