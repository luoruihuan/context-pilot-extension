import type { TabReference } from "@/shared/types/domain";

export interface ContextState {
  selectedTabs: TabReference[];
}

export const initialContextState: ContextState = { selectedTabs: [] };

export type ContextAction =
  | { type: "add"; tab: TabReference }
  | { type: "remove"; tabId: number }
  | { type: "replace"; tabs: TabReference[] }
  | { type: "clear" };

export function contextReducer(
  state: ContextState,
  action: ContextAction,
): ContextState {
  switch (action.type) {
    case "add":
      if (
        state.selectedTabs.length >= 10 ||
        state.selectedTabs.some((tab) => tab.tabId === action.tab.tabId)
      ) {
        return state;
      }
      return { selectedTabs: [...state.selectedTabs, action.tab] };
    case "remove":
      return {
        selectedTabs: state.selectedTabs.filter((tab) => tab.tabId !== action.tabId),
      };
    case "replace": {
      const unique = action.tabs.filter(
        (tab, index, tabs) =>
          tabs.findIndex((candidate) => candidate.tabId === tab.tabId) === index,
      );
      return { selectedTabs: unique.slice(0, 10) };
    }
    case "clear":
      return initialContextState;
  }
}
