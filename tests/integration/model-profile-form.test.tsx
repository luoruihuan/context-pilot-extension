// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModelProfileForm } from "@/features/settings/ModelProfileForm";
import { SettingsView } from "@/features/settings/SettingsView";
import type { ModelProfile } from "@/shared/types/domain";

afterEach(cleanup);

const profile = (id: string, name: string): ModelProfile => ({
  id,
  name,
  provider: "openai-chat",
  baseUrl: "https://api.example.com/v1",
  apiKey: "key",
  model: "model",
  maxOutputTokens: 1024,
  isDefault: id === "p1",
  createdAt: 1,
  updatedAt: 1,
});

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

  it("shows connection test failures as an alert", async () => {
    const user = userEvent.setup();
    const onTest = vi.fn().mockRejectedValue(new Error("连接失败"));
    render(<ModelProfileForm onSave={vi.fn()} onTest={onTest} />);

    await user.type(screen.getByLabelText("配置名称"), "Work");
    await user.type(screen.getByLabelText("API 地址"), "https://api.example.com/v1");
    await user.type(screen.getByLabelText("API Key"), "key");
    await user.type(screen.getByLabelText("模型名称"), "model");
    await user.click(screen.getByRole("button", { name: "测试连接" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("连接失败");
  });

  it("shows a retryable origin permission error when saving is rejected", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("需要授权模型服务地址。请重试授权。"));
    render(<ModelProfileForm onSave={onSave} onTest={vi.fn()} />);

    await user.type(screen.getByLabelText("配置名称"), "Work");
    await user.type(screen.getByLabelText("API 地址"), "https://api.example.com/v1");
    await user.type(screen.getByLabelText("API Key"), "key");
    await user.type(screen.getByLabelText("模型名称"), "model");
    await user.click(screen.getByRole("button", { name: "保存模型" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("需要授权模型服务地址。请重试授权。");
  });

  it("lists profiles and supports selecting, creating, and deleting a profile", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    const onDelete = vi.fn();
    render(
      <SettingsView
        profiles={[profile("p1", "Primary"), profile("p2", "Backup")]}
        profile={profile("p1", "Primary")}
        onBack={vi.fn()}
        onSave={vi.fn()}
        onTest={vi.fn()}
        onSelect={onSelect}
        onCreate={onCreate}
        onDelete={onDelete}
      />,
    );
    expect(screen.getByRole("option", { name: /Primary/ })).toBeVisible();
    expect(screen.getByRole("option", { name: /Backup/ })).toBeVisible();
    await user.click(screen.getByRole("option", { name: /Backup/ }));
    expect(onSelect).toHaveBeenCalledWith("p2");
    await user.click(screen.getByRole("button", { name: "新建配置" }));
    expect(onCreate).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "删除配置" }));
    expect(onDelete).toHaveBeenCalledWith("p1");
  });
});
