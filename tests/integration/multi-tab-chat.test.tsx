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

afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
});

describe("multi-tab chat", () => {
  it("requires the one-time provider disclosure before the first send", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onAcceptDisclosure = vi.fn().mockResolvedValue(undefined);
    render(
      <ChatView
        turns={[]}
        tabs={tabs}
        selectedTabs={[tabs[0]!]}
        onTabsChange={vi.fn()}
        onSubmit={onSubmit}
        configured
        onOpenSettings={vi.fn()}
        disclosureAccepted={false}
        onAcceptDisclosure={onAcceptDisclosure}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "向 AI 提问" }), "总结页面");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    const dialog = screen.getByRole("dialog", { name: "发送前确认" });
    expect(dialog).toHaveTextContent("页面内容、标题、URL 和你的问题会直接发送到你配置的 AI 服务商");
    expect(dialog).toHaveTextContent("Context Pilot 开发者不接收这些内容");
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "暂不发送" }));
    expect(screen.queryByRole("dialog", { name: "发送前确认" })).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByRole("textbox", { name: "向 AI 提问" }), "总结页面");
    await user.click(screen.getByRole("button", { name: "发送消息" }));
    await user.click(screen.getByRole("button", { name: "同意并发送" }));

    expect(onAcceptDisclosure).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith("总结页面", [1]);
  });

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

  it("shows an accessible retry action when reading is stopped before extraction completes", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
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
        onRetry={onRetry}
        status="stopped"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("已停止读取");
    await user.click(screen.getByRole("button", { name: "重试读取" }));
    expect(onRetry).toHaveBeenCalledWith("user-1");
  });

  it("shows an accessible retry action when reading fails before a response", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ChatView
        turns={[{
          id: "user-failed",
          role: "user",
          content: "分析页面",
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
        onRetry={onRetry}
        status="error"
        errorMessage="所有所选页签均读取失败。"
      />,
    );

    await user.click(screen.getByRole("button", { name: "重试请求" }));
    expect(onRetry).toHaveBeenCalledWith("user-failed");
  });

  it("shows stopped reading for the current user turn after a completed conversation", () => {
    render(
      <ChatView
        turns={[
          { id: "user-1", role: "user", content: "第一问", sources: [], createdAt: 1, status: "complete" },
          { id: "assistant-1", role: "assistant", content: "第一答", sources: [], createdAt: 2, status: "complete" },
          { id: "user-2", role: "user", content: "第二问", sources: [], createdAt: 3, status: "complete" },
        ]}
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

  it("does not duplicate the stopped message when the current turn has a stopped assistant", () => {
    render(
      <ChatView
        turns={[
          { id: "user-1", role: "user", content: "问题", sources: [], createdAt: 1, status: "complete" },
          { id: "assistant-1", role: "assistant", content: "部分回答", sources: [], createdAt: 2, status: "stopped" },
        ]}
        tabs={tabs}
        selectedTabs={[tabs[0]!]}
        onTabsChange={vi.fn()}
        onSubmit={vi.fn()}
        configured
        onOpenSettings={vi.fn()}
        status="stopped"
      />,
    );

    expect(screen.getByText("已停止")).toBeVisible();
    expect(screen.queryByText("已停止读取")).not.toBeInTheDocument();
  });

  it("copies and retries terminal assistant messages with accessible controls", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const onRetry = vi.fn();
    render(
      <ChatView
        turns={[
          { id: "assistant-complete", role: "assistant", content: "完整回答", sources: [], createdAt: 1, status: "complete" },
          { id: "assistant-stopped", role: "assistant", content: "部分回答", sources: [], createdAt: 2, status: "stopped" },
          { id: "assistant-error", role: "assistant", content: "失败前内容", sources: [], createdAt: 3, status: "error" },
        ]}
        tabs={tabs}
        selectedTabs={[tabs[0]!]}
        onTabsChange={vi.fn()}
        onSubmit={vi.fn()}
        onRetry={onRetry}
        configured
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: /复制回答/ })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /重试回答/ })).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "复制回答：完整回答" }));
    await user.click(screen.getByRole("button", { name: "重试回答：部分回答" }));

    expect(writeText).toHaveBeenCalledWith("完整回答");
    expect(onRetry).toHaveBeenCalledWith("assistant-stopped");
  });

  it("shows a friendly copy error when Clipboard API is unavailable", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    render(
      <ChatView
        turns={[{ id: "assistant-1", role: "assistant", content: "回答", sources: [], createdAt: 1, status: "complete" }]}
        tabs={tabs}
        selectedTabs={[tabs[0]!]}
        onTabsChange={vi.fn()}
        onSubmit={vi.fn()}
        configured
        onOpenSettings={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "复制回答：回答" }));
    expect(screen.getByRole("alert")).toHaveTextContent("无法复制");
  });

  it("shows a visible warning when an answer could not be saved to history", () => {
    render(
      <ChatView
        turns={[{ id: "assistant-1", role: "assistant", content: "回答", sources: [], createdAt: 1, status: "complete" }]}
        tabs={tabs}
        selectedTabs={[tabs[0]!]}
        onTabsChange={vi.fn()}
        onSubmit={vi.fn()}
        configured
        onOpenSettings={vi.fn()}
        persistenceWarning="回答已生成，但历史记录未保存。"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("回答已生成，但历史记录未保存。");
  });
});
