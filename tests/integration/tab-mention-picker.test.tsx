// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Composer } from "@/features/chat/Composer";
import type { TabReference } from "@/shared/types/domain";

const tabs: TabReference[] = [
  {
    tabId: 1,
    windowId: 1,
    title: "Current article",
    url: "https://example.com/current",
    origin: "https://example.com",
    isCurrent: true,
    permission: "granted",
  },
  {
    tabId: 2,
    windowId: 1,
    title: "Research notes",
    url: "https://docs.example.com/notes",
    origin: "https://docs.example.com",
    isCurrent: false,
    permission: "required",
  },
];

afterEach(cleanup);

describe("Composer tab mentions", () => {
  it("opens the picker on @ and selects with the keyboard", async () => {
    const user = userEvent.setup();
    const onTabsChange = vi.fn();
    render(
      <Composer
        tabs={tabs}
        selectedTabs={[]}
        onTabsChange={onTabsChange}
        onSubmit={vi.fn()}
      />,
    );

    const textbox = screen.getByRole("textbox", { name: "向 AI 提问" });
    await user.type(textbox, "@");
    expect(
      screen.getByRole("combobox", { name: "引用已打开页签" }),
    ).toBeVisible();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onTabsChange).toHaveBeenCalledWith([tabs[1]]);
  });

  it("closes the picker with Escape and removes the last chip with Backspace", async () => {
    const user = userEvent.setup();
    const onTabsChange = vi.fn();
    render(
      <Composer
        tabs={tabs}
        selectedTabs={[tabs[0]!]}
        onTabsChange={onTabsChange}
        onSubmit={vi.fn()}
      />,
    );

    const textbox = screen.getByRole("textbox", { name: "向 AI 提问" });
    await user.type(textbox, "@");
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("combobox", { name: "引用已打开页签" }),
    ).not.toBeInTheDocument();
    await user.clear(textbox);
    await user.keyboard("{Backspace}");
    expect(onTabsChange).toHaveBeenLastCalledWith([]);
  });

  it("requests tabs permission before listing and origin permission before selecting a required tab", async () => {
    const user = userEvent.setup();
    const events: string[] = [];
    const onTabsChange = vi.fn();
    const onRequestTabsPermission = vi.fn(async () => { events.push("tabs"); return true; });
    const onRequestTabAccess = vi.fn(async () => { events.push("origin"); return true; });
    render(
      <Composer
        tabs={tabs}
        selectedTabs={[]}
        onTabsChange={onTabsChange}
        onSubmit={vi.fn()}
        onRequestTabsPermission={onRequestTabsPermission}
        onRequestTabAccess={onRequestTabAccess}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "向 AI 提问" }), "@");
    await user.click(screen.getByRole("option", { name: /Research notes/ }));

    expect(events).toEqual(["tabs", "origin"]);
    expect(onRequestTabAccess).toHaveBeenCalledWith(tabs[1]);
    expect(onTabsChange).toHaveBeenCalledWith([
      expect.objectContaining({ tabId: 2, permission: "granted" }),
    ]);
  });

  it("keeps a denied required tab visible and exposes a retryable error", async () => {
    const user = userEvent.setup();
    const onTabsChange = vi.fn();
    const onRequestTabAccess = vi.fn().mockResolvedValue(false);
    render(
      <Composer
        tabs={tabs}
        selectedTabs={[]}
        onTabsChange={onTabsChange}
        onSubmit={vi.fn()}
        onRequestTabsPermission={vi.fn().mockResolvedValue(true)}
        onRequestTabAccess={onRequestTabAccess}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "向 AI 提问" }), "@");
    await user.click(screen.getByRole("option", { name: /Research notes/ }));

    expect(onTabsChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("需要授权");
    expect(screen.getByRole("option", { name: /Research notes/ })).toBeVisible();
  });

  it("renders a restricted tab even when Chrome withholds its URL", async () => {
    const user = userEvent.setup();
    render(
      <Composer
        tabs={[{ ...tabs[1]!, title: "受限页面", url: "", origin: "", permission: "restricted" }]}
        selectedTabs={[]}
        onTabsChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "引用页签" }));
    expect(screen.getByRole("option", { name: /受限页面/ })).toBeVisible();
    expect(screen.getByText("不可读取")).toBeVisible();
  });
});
