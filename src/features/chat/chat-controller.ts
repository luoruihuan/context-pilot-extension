import { buildChatPrompt } from "@/features/chat/prompt-builder";
import {
  chatReducer,
  initialChatState,
  type ChatAction,
  type ChatState,
  type SourceError,
} from "@/features/chat/chat-reducer";
import type { TabExtractionResult } from "@/services/browser/extraction-client";
import { buildContext } from "@/services/extraction";
import type { ModelProvider } from "@/services/llm/provider";
import type { Conversation } from "@/services/storage";
import type {
  ChatTurn,
  ModelProfile,
  PageSnapshot,
  ProviderError,
  ProviderKind,
} from "@/shared/types/domain";

interface ExtractionPort {
  extractTabs(tabIds: number[]): Promise<TabExtractionResult[]>;
}

interface ConversationPort {
  save(conversation: Conversation): Promise<void>;
}

export interface ChatControllerDependencies {
  extraction: ExtractionPort;
  getProfile(profileId: string): Promise<ModelProfile | undefined>;
  getProvider(kind: ProviderKind): ModelProvider;
  conversations: ConversationPort;
  createId?: () => string;
  now?: () => number;
}

export interface SendChatInput {
  text: string;
  tabIds: number[];
  profileId: string;
}

type Listener = (state: ChatState) => void;

const contextError = (message: string): { code: string; message: string } => ({
  code: "CONTEXT_UNAVAILABLE",
  message,
});

export class ChatController {
  private state = initialChatState;
  private readonly listeners = new Set<Listener>();
  private readonly createId: () => string;
  private readonly now: () => number;
  private abortController?: AbortController;
  private activeAssistantTurnId?: string;
  private conversationId?: string;
  private createdAt?: number;
  private runId = 0;

  constructor(private readonly dependencies: ChatControllerDependencies) {
    this.createId = dependencies.createId ?? (() => crypto.randomUUID());
    this.now = dependencies.now ?? (() => Date.now());
  }

  getState(): ChatState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(): void {
    this.stop();
    this.runId += 1;
    this.conversationId = undefined;
    this.createdAt = undefined;
    this.dispatch({ type: "reset" });
  }

  restore(conversation: Conversation): void {
    this.stop();
    this.runId += 1;
    this.conversationId = conversation.id;
    this.createdAt = conversation.createdAt;
    this.dispatch({ type: "restore", turns: conversation.turns });
  }

  forgetConversation(id: string): void {
    if (this.conversationId !== id) return;
    this.reset();
  }

  stop(): void {
    if (this.state.status !== "extracting" && this.state.status !== "streaming") return;
    this.abortController?.abort();
    this.dispatch({ type: "stopped", turnId: this.activeAssistantTurnId });
  }

  async send(input: SendChatInput): Promise<void> {
    if (this.state.status === "extracting" || this.state.status === "streaming") return;
    const text = input.text.trim();
    const tabIds = [...input.tabIds];
    if (!text || tabIds.length === 0) {
      this.dispatch({ type: "error", error: contextError("请选择至少一个可读取页签。") });
      return;
    }
    const runId = ++this.runId;

    const startedAt = this.now();
    const userTurn: ChatTurn = {
      id: this.createId(),
      role: "user",
      content: text,
      sources: [],
      createdAt: startedAt,
      status: "complete",
    };
    this.dispatch({ type: "extracting", userTurn });

    let profile: ModelProfile | undefined;
    try {
      profile = await this.dependencies.getProfile(input.profileId);
    } catch {
      if (!this.isCurrentRun(runId)) return;
      this.dispatch({
        type: "error",
        error: { code: "MODEL_CONFIG_UNAVAILABLE", message: "无法读取模型配置。" },
      });
      await this.persist();
      return;
    }
    if (!this.isCurrentRun(runId)) return;
    if (profile === undefined) {
      this.dispatch({
        type: "error",
        error: { code: "MODEL_NOT_CONFIGURED", message: "未找到所选模型配置。" },
      });
      await this.persist();
      return;
    }

    let extractionResults: TabExtractionResult[];
    try {
      extractionResults = await this.dependencies.extraction.extractTabs(tabIds);
    } catch {
      if (!this.isCurrentRun(runId)) return;
      if (this.state.status === "stopped") {
        await this.persist();
        return;
      }
      this.dispatch({
        type: "error",
        error: contextError("无法读取所选页签。"),
      });
      await this.persist();
      return;
    }

    if (!this.isCurrentRun(runId)) return;
    if (this.state.status === "stopped") {
      await this.persist();
      return;
    }

    const { snapshots, sourceErrors } = numberSources(tabIds, extractionResults);
    if (snapshots.length === 0) {
      this.dispatch({
        type: "error",
        error: contextError("所有所选页签均读取失败。"),
        sourceErrors,
      });
      await this.persist();
      return;
    }

    const context = buildContext(snapshots);
    const sources = context.sources;
    const sourcedUserTurn: ChatTurn = { ...userTurn, sources };
    const assistantTurn: ChatTurn = {
      id: this.createId(),
      role: "assistant",
      content: "",
      sources,
      createdAt: this.now(),
      status: "streaming",
    };
    this.activeAssistantTurnId = assistantTurn.id;
    const abortController = new AbortController();
    this.abortController = abortController;
    this.dispatch({ type: "streaming", userTurn: sourcedUserTurn, assistantTurn, sourceErrors });

    const prompt = buildChatPrompt({ question: text, context: context.text });
    const history = this.state.turns
      .slice(0, -2)
      .filter((turn) => turn.content.length > 0)
      .map(({ role, content }) => ({ role, content }));

    try {
      const provider = this.dependencies.getProvider(profile.provider);
      for await (const event of provider.streamChat(profile, {
        model: profile.model,
        system: prompt.system,
        messages: [...history, ...prompt.messages],
        maxOutputTokens: profile.maxOutputTokens,
        ...(profile.temperature === undefined ? {} : { temperature: profile.temperature }),
        signal: abortController.signal,
      })) {
        if (!this.isCurrentRun(runId)) break;
        if (event.type === "text-delta") {
          if (this.isStreaming()) {
            this.dispatch({ type: "delta", turnId: assistantTurn.id, text: event.text });
          }
        } else if (event.type === "usage") {
          this.dispatch({
            type: "usage",
            usage: {
              ...(event.inputTokens === undefined ? {} : { inputTokens: event.inputTokens }),
              ...(event.outputTokens === undefined ? {} : { outputTokens: event.outputTokens }),
            },
          });
        } else if (event.type === "error") {
          this.handleProviderError(event.error, assistantTurn.id);
          break;
        } else if (event.type === "done" && this.isStreaming()) {
          this.dispatch({ type: "complete", turnId: assistantTurn.id });
        }
      }
      if (this.isCurrentRun(runId) && this.isStreaming()) {
        this.dispatch({ type: "complete", turnId: assistantTurn.id });
      }
    } catch {
      if (!this.isCurrentRun(runId)) return;
      if (abortController.signal.aborted) {
        this.dispatch({ type: "stopped", turnId: assistantTurn.id });
      } else {
        this.dispatch({
          type: "error",
          error: { code: "UNKNOWN", message: "模型服务返回了意外错误。" },
          turnId: assistantTurn.id,
        });
      }
    } finally {
      if (this.isCurrentRun(runId)) {
        this.abortController = undefined;
        this.activeAssistantTurnId = undefined;
        await this.persist();
      }
    }
  }

  private handleProviderError(error: ProviderError, turnId: string): void {
    if (error.code === "ABORTED" || this.abortController?.signal.aborted) {
      this.dispatch({ type: "stopped", turnId });
      return;
    }
    this.dispatch({ type: "error", error, turnId });
  }

  private isStreaming(): boolean {
    return this.state.status === "streaming";
  }

  private isCurrentRun(runId: number): boolean {
    return this.runId === runId;
  }

  private dispatch(action: ChatAction): void {
    this.state = chatReducer(this.state, action);
    this.listeners.forEach((listener) => listener(this.state));
  }

  private async persist(): Promise<void> {
    if (this.state.turns.length === 0) return;
    const timestamp = this.now();
    this.conversationId ??= this.createId();
    this.createdAt ??= timestamp;
    await this.dependencies.conversations.save({
      id: this.conversationId,
      turns: this.state.turns,
      createdAt: this.createdAt,
      updatedAt: timestamp,
    });
  }
}

function numberSources(
  tabIds: number[],
  results: TabExtractionResult[],
): { snapshots: PageSnapshot[]; sourceErrors: SourceError[] } {
  const byTabId = new Map(results.map((result) => [result.tabId, result]));
  const snapshots: PageSnapshot[] = [];
  const sourceErrors: SourceError[] = [];

  tabIds.forEach((tabId, index) => {
    const sourceId = `T${index + 1}`;
    const result = byTabId.get(tabId);
    if (result?.status === "fulfilled") {
      snapshots.push({ ...result.snapshot, sourceId });
    } else {
      sourceErrors.push({
        sourceId,
        tabId,
        code: result?.code ?? "EXTRACTION_FAILED",
        message: result?.message ?? "Page extraction failed",
      });
    }
  });

  return { snapshots, sourceErrors };
}
