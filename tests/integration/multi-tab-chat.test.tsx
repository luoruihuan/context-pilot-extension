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

  it("keeps restricted and reading states visible with accessible status and stop control", () => {
    const restricted = { ...tabs[1]!, permission: "restricted" as const };
    render(
      <ChatView
        turns={[]}
        tabs={[tabs[0]!, restricted]}
        selectedTabs={[restricted]}
        onTabsChange={vi.fn()}
        onSubmit={vi.fn()}
        configured
        onOpenSettings={vi.fn()}
        readingTabs={[restricted.tabId]}
        onStop={vi.fn()}
        streaming
      />,
    );
    expect(screen.getByText("不可读取")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("读取中");
    expect(screen.getByRole("button", { name: "停止读取" })).toBeVisible();
  });

  it("keeps a permission failure visible and lets the user retry access", async () => {
    const user = userEvent.setup();
    const onTabsChange = vi.fn();
    const onRequestTabAccess = vi.fn().mockResolvedValue(true);
    render(
      <ChatView
        turns={[]}
        tabs={tabs}
        selectedTabs={[tabs[1]!]}
        onTabsChange={onTabsChange}
        onSubmit={vi.fn()}
        configured
        onOpenSettings={vi.fn()}
        sourceErrors={[{ sourceId: "T1", tabId: 2, code: "PERMISSION_REQUIRED", message: "denied" }]}
        onRequestTabAccess={onRequestTabAccess}
      />,
    );

    await user.click(screen.getByRole("button", { name: "重新授权 Beta" }));
    expect(onRequestTabAccess).toHaveBeenCalledWith(expect.objectContaining({ tabId: 2 }));
    expect(onTabsChange).toHaveBeenCalledWith([
      expect.objectContaining({ tabId: 2, permission: "granted" }),
    ]);
  });

  it("shows an accessible terminal message when reading is stopped before extraction completes", () => {
    render(
      <ChatView
        turns={[{
          id: "user-1",
          role: "user",
          content: "读取当前页面",
          sources: [],
          createdAt: 1,
          status: "complete",
        }]}
        tabs={tabs}
        selectedTabs={[tabs[0]!]}
        onTabsChange={vi.fn()}
        onSubmit={vi.fn()}
        configured
        onOpenSettings={vi.fn()}
        status="stopped"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("已停止读取");
  });
});
