// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatView } from "@/features/chat/ChatView";
import type { TabReference } from "@/shared/types/domain";

const tabs: TabReference[] = [
  {
    tabId: 1,
    windowId: 1,
    title: "Alpha",
    url: "https://alpha.example",
    origin: "https://alpha.example",
    isCurrent: true,
    permission: "granted",
  },
  {
    tabId: 2,
    windowId: 1,
    title: "Beta",
    url: "https://beta.example",
    origin: "https://beta.example",
    isCurrent: false,
    permission: "granted",
  },
];

afterEach(cleanup);

describe("multi-tab chat", () => {
  it("submits an immutable snapshot of all selected tab ids", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <ChatView
        turns={[]}
        tabs={tabs}
        selectedTabs={tabs}
        onTabsChange={vi.fn()}
        onSubmit={onSubmit}
        configured
        onOpenSettings={vi.fn()}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "向 AI 提问" }), "比较两个页面");
    await user.click(screen.getByRole("button", { name: "发送消息" }));
    rerender(
      <ChatView
        turns={[]}
        tabs={tabs}
        selectedTabs={[tabs[0]!]}
        onTabsChange={vi.fn()}
        onSubmit={onSubmit}
        configured
        onOpenSettings={vi.fn()}
      />,
    );

    expect(onSubmit).toHaveBeenCalledWith("比较两个页面", [1, 2]);
    expect(onSubmit.mock.calls[0]?.[1]).toEqual([1, 2]);
  });
});
