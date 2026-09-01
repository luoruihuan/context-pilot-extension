// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModelProfileForm } from "@/features/settings/ModelProfileForm";

afterEach(cleanup);

describe("ModelProfileForm", () => {
  it("saves an OpenAI-compatible profile with a secret key", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<ModelProfileForm onSave={onSave} onTest={vi.fn()} />);

    await user.type(screen.getByLabelText("配置名称"), "Work model");
    await user.type(screen.getByLabelText("API 地址"), "https://api.example.com/v1");
    await user.type(screen.getByLabelText("API Key"), "secret-key");
    await user.type(screen.getByLabelText("模型名称"), "gpt-compatible");
    await user.click(screen.getByRole("button", { name: "保存模型" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Work model",
        provider: "openai-chat",
        apiKey: "secret-key",
        model: "gpt-compatible",
      }),
    );
  });

  it("tests the current Anthropic configuration without displaying the key", async () => {
    const user = userEvent.setup();
    const onTest = vi.fn().mockResolvedValue(undefined);
    render(<ModelProfileForm onSave={vi.fn()} onTest={onTest} />);

    await user.selectOptions(screen.getByLabelText("API 协议"), "anthropic-messages");
    await user.type(screen.getByLabelText("配置名称"), "Claude");
    await user.type(screen.getByLabelText("API 地址"), "https://api.anthropic.com");
    await user.type(screen.getByLabelText("API Key"), "hidden-key");
    await user.type(screen.getByLabelText("模型名称"), "claude-compatible");
    expect(screen.getByLabelText("API Key")).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "测试连接" }));

    expect(onTest).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "anthropic-messages" }),
    );
  });
});
