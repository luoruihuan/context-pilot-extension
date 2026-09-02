// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MessageList } from "@/features/chat/MessageList";

afterEach(cleanup);

describe("MessageList", () => {
  it("renders assistant Markdown instead of showing syntax markers", () => {
    render(
      <MessageList
        turns={[{
          id: "assistant-1",
          role: "assistant",
          content: "## 结论\n\n**重点**\n\n- 第一项\n- 第二项\n\n`const value = 1`",
          sources: [],
          createdAt: 1,
          status: "complete",
        }]}
      />,
    );

    expect(screen.getByRole("heading", { name: "结论" })).toBeVisible();
    expect(screen.getByText("重点")).toBeVisible();
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("第一项");
    expect(screen.getByText("const value = 1")).toBeVisible();
    expect(screen.queryByText("**重点**")).not.toBeInTheDocument();
  });

  it("does not repeat source tabs below each assistant message", () => {
    render(
      <MessageList
        turns={[{
          id: "assistant-2",
          role: "assistant",
          content: "回答内容",
          sources: [{ sourceId: "T1", title: "当前页面", url: "https://example.com", extractedAt: 1 }],
          createdAt: 1,
          status: "complete",
        }]}
      />,
    );

    expect(screen.queryByRole("link", { name: /T1/ })).not.toBeInTheDocument();
  });
});
