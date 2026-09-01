import { z } from "zod";

export const providerKindSchema = z.enum(["openai-chat", "anthropic-messages"]);

export const modelProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: providerKindSchema,
  baseUrl: z.string(),
  apiKey: z.string(),
  model: z.string(),
  maxOutputTokens: z.number(),
  temperature: z.number().optional(),
  isDefault: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const tabReferenceSchema = z.object({
  tabId: z.number(),
  windowId: z.number(),
  title: z.string(),
  url: z.string(),
  origin: z.string(),
  favIconUrl: z.string().optional(),
  isCurrent: z.boolean(),
  permission: z.enum(["granted", "required", "restricted"]),
});

const pageHeadingSchema = z.object({
  level: z.number(),
  text: z.string(),
});

const pageTableSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

export const pageSnapshotSchema = z.object({
  sourceId: z.string(),
  tabId: z.number(),
  title: z.string(),
  url: z.string(),
  extractedAt: z.number(),
  routeVersion: z.string(),
  selectedText: z.string().optional(),
  description: z.string().optional(),
  headings: z.array(pageHeadingSchema),
  paragraphs: z.array(z.string()),
  lists: z.array(z.array(z.string())),
  tables: z.array(pageTableSchema),
  plainText: z.string(),
  extractionMethod: z.enum(["readability", "visible-text"]),
  truncated: z.boolean(),
});

export const chatTurnSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  sources: z.array(
    pageSnapshotSchema.pick({
      sourceId: true,
      title: true,
      url: true,
      extractedAt: true,
    }),
  ),
  createdAt: z.number(),
  status: z.enum(["streaming", "complete", "stopped", "error"]),
});

export const chatRequestSchema = z.object({
  model: z.string(),
  system: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
  maxOutputTokens: z.number(),
  temperature: z.number().optional(),
  signal: z.instanceof(AbortSignal),
});

export const providerErrorCodeSchema = z.enum([
  "AUTH_INVALID",
  "PERMISSION_REQUIRED",
  "RATE_LIMITED",
  "QUOTA_EXCEEDED",
  "MODEL_NOT_FOUND",
  "CONTEXT_TOO_LARGE",
  "NETWORK_ERROR",
  "TIMEOUT",
  "UNSUPPORTED_RESPONSE",
  "ABORTED",
  "UNKNOWN",
]);

export const providerErrorSchema = z.object({
  code: providerErrorCodeSchema,
  message: z.string(),
  provider: providerKindSchema.optional(),
  status: z.number().optional(),
  requestId: z.string().optional(),
});

export const chatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text-delta"), text: z.string() }),
  z.object({
    type: z.literal("usage"),
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
  }),
  z.object({ type: z.literal("done"), finishReason: z.string().optional() }),
  z.object({ type: z.literal("error"), error: providerErrorSchema }),
]);

export type ProviderKind = z.infer<typeof providerKindSchema>;
export type ModelProfile = z.infer<typeof modelProfileSchema>;
export type TabReference = z.infer<typeof tabReferenceSchema>;
export type PageSnapshot = z.infer<typeof pageSnapshotSchema>;
export type ChatTurn = z.infer<typeof chatTurnSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ProviderError = z.infer<typeof providerErrorSchema>;
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
