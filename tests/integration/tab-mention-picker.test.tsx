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
});
