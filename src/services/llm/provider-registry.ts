import type { ProviderKind } from "@/shared/types/domain";
import { AnthropicMessagesProvider } from "@/services/llm/anthropic-messages-provider";
import { OpenAIChatProvider } from "@/services/llm/openai-chat-provider";
import type { ModelProvider } from "@/services/llm/provider";

const providers: Record<ProviderKind, ModelProvider> = {
  "openai-chat": new OpenAIChatProvider(),
  "anthropic-messages": new AnthropicMessagesProvider(),
};

export function getProvider(kind: ProviderKind): ModelProvider {
  return providers[kind];
}
