import type { ChatTurn, ProviderError } from "@/shared/types/domain";

export type ChatStatus =
  | "idle"
  | "extracting"
  | "streaming"
  | "complete"
  | "stopped"
  | "error";

export interface SourceError {
  sourceId: string;
  tabId: number;
  code: string;
  message: string;
}

export interface ChatUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ChatState {
  status: ChatStatus;
  turns: ChatTurn[];
  sourceErrors: SourceError[];
  usage?: ChatUsage;
  error?: ProviderError | { code: string; message: string };
  persistenceWarning?: string;
}

export const initialChatState: ChatState = {
  status: "idle",
  turns: [],
  sourceErrors: [],
};

export type ChatAction =
  | { type: "extracting"; userTurn: ChatTurn }
  | { type: "streaming"; userTurn: ChatTurn; assistantTurn: ChatTurn; sourceErrors: SourceError[] }
  | { type: "delta"; turnId: string; text: string }
  | { type: "usage"; usage: ChatUsage }
  | { type: "complete"; turnId: string }
  | { type: "stopped"; turnId?: string }
  | { type: "error"; error: ChatState["error"]; turnId?: string; sourceErrors?: SourceError[] }
  | { type: "restore"; turns: ChatTurn[] }
  | { type: "reset" }
  | { type: "persistence-warning"; message: string };

function updateTurn(
  turns: ChatTurn[],
  turnId: string | undefined,
  update: (turn: ChatTurn) => ChatTurn,
): ChatTurn[] {
  return turnId === undefined
    ? turns
    : turns.map((turn) => (turn.id === turnId ? update(turn) : turn));
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "extracting":
      return {
        status: "extracting",
        turns: [...state.turns, action.userTurn],
        sourceErrors: [],
      };
    case "streaming":
      return {
        status: "streaming",
        turns: [
          ...state.turns.slice(0, -1),
          action.userTurn,
          action.assistantTurn,
        ],
        sourceErrors: action.sourceErrors,
      };
    case "delta":
      return {
        ...state,
        turns: updateTurn(state.turns, action.turnId, (turn) => ({
          ...turn,
          content: turn.content + action.text,
        })),
      };
    case "usage":
      return { ...state, usage: { ...state.usage, ...action.usage } };
    case "complete":
      return {
        ...state,
        status: "complete",
        turns: updateTurn(state.turns, action.turnId, (turn) => ({
          ...turn,
          status: "complete",
        })),
      };
    case "stopped":
      return {
        ...state,
        status: "stopped",
        turns: updateTurn(state.turns, action.turnId, (turn) => ({
          ...turn,
          status: "stopped",
        })),
      };
    case "error":
      return {
        ...state,
        status: "error",
        error: action.error,
        sourceErrors: action.sourceErrors ?? state.sourceErrors,
        turns: updateTurn(state.turns, action.turnId, (turn) => ({
          ...turn,
          status: "error",
        })),
      };
    case "restore":
      return {
        status: "idle",
        turns: structuredClone(action.turns),
        sourceErrors: [],
      };
    case "reset":
      return initialChatState;
    case "persistence-warning":
      return { ...state, persistenceWarning: action.message };
  }
}
