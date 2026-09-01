import { describe, expect, it } from "vitest";

import {
  contextReducer,
  initialContextState,
} from "@/features/context/context-reducer";
import type { TabReference } from "@/shared/types/domain";

function tab(tabId: number): TabReference {
  return {
    tabId,
    windowId: 1,
    title: `Tab ${tabId}`,
    url: `https://example.com/${tabId}`,
    origin: "https://example.com",
    isCurrent: tabId === 1,
    permission: "granted",
  };
}

describe("contextReducer", () => {
  it("prevents selecting more than ten unique tabs", () => {
    const state = {
      ...initialContextState,
      selectedTabs: Array.from({ length: 10 }, (_, index) => tab(index + 1)),
    };
    expect(contextReducer(state, { type: "add", tab: tab(11) })).toBe(state);
  });

  it("does not add the same tab twice and removes by ID", () => {
    const once = contextReducer(initialContextState, { type: "add", tab: tab(1) });
    expect(contextReducer(once, { type: "add", tab: tab(1) })).toBe(once);
    expect(
      contextReducer(once, { type: "remove", tabId: 1 }).selectedTabs,
    ).toEqual([]);
  });
});
