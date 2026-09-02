import { expect, test as base, chromium, type BrowserContext, type Page } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startMockAiServer, type MockAiServer } from "./fixtures/mock-ai-server";

const extensionPath = resolve(".output/chrome-mv3");
const storeAssetRoot = resolve(
  process.env.UPDATE_STORE_ASSETS === "1" ? "store-assets" : "test-results/playwright/store-assets",
);

interface ExtensionFixture {
  context: BrowserContext;
  extensionId: string;
  panel: Page;
}

interface WorkerFixture {
  server: MockAiServer;
}

const test = base.extend<ExtensionFixture, WorkerFixture>({
  server: [async ({ browserName }, use) => {
    void browserName;
    const server = await startMockAiServer();
    await use(server);
    await server.close();
  }, { scope: "worker" }],
  context: async ({ browserName }, use) => {
    void browserName;
    const profile = await mkdtemp(join(tmpdir(), "context-pilot-e2e-"));
    const testExtensionPath = join(profile, "extension");
    await cp(extensionPath, testExtensionPath, { recursive: true });
    const manifestPath = join(testExtensionPath, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      permissions: string[];
      optional_permissions?: string[];
      optional_host_permissions?: string[];
      host_permissions?: string[];
    };
    manifest.permissions = [...manifest.permissions, ...(manifest.optional_permissions ?? [])];
    manifest.host_permissions = [...(manifest.optional_host_permissions ?? [])];
    delete manifest.optional_permissions;
    delete manifest.optional_host_permissions;
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
    const context = await chromium.launchPersistentContext(profile, {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${testExtensionPath}`, `--load-extension=${testExtensionPath}`],
      viewport: { width: 480, height: 800 },
    });
    await use(context);
    await context.close();
    await rm(profile, { recursive: true, force: true });
  },
  extensionId: async ({ context }, use) => {
    let worker = context.serviceWorkers()[0];
    worker ??= await context.waitForEvent("serviceworker");
    await use(new URL(worker.url()).host);
  },
  panel: async ({ context, extensionId, server }, use) => {
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.evaluate(async ({ origin }) => {
      await chrome.storage.local.set({
        modelProfiles: [{
          id: "e2e-openai", name: "本地 OpenAI", provider: "openai-chat",
          baseUrl: `${origin}/v1`, apiKey: "e2e-local-key", model: "mock-model",
          maxOutputTokens: 256, temperature: 0, isDefault: true, createdAt: 1, updatedAt: 1,
        }],
      });
    }, { origin: server.origin });
    await panel.reload();
    await use(panel);
  },
});

async function openPage(context: BrowserContext, url: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(url);
  await page.bringToFront();
  return page;
}

async function reloadPanelForActiveTab(panel: Page, active: Page): Promise<void> {
  await active.bringToFront();
  await panel.reload();
  await expect(panel.getByRole("main", { name: "Context Pilot" })).toBeVisible();
}

async function submit(panel: Page, question: string): Promise<void> {
  await panel.getByRole("textbox", { name: "向 AI 提问" }).fill(question);
  await panel.getByRole("button", { name: "发送消息" }).click();
  const disclosure = panel.getByRole("dialog", { name: "发送前确认" });
  if (await disclosure.isVisible().catch(() => false)) {
    await disclosure.getByRole("button", { name: "同意并发送" }).click();
  }
}

test("生产 manifest 下可选页签和模型 origin 权限拒绝均可重试", async ({ server }) => {
  const profile = await mkdtemp(join(tmpdir(), "context-pilot-permission-e2e-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--deny-permission-prompts",
    ],
    viewport: { width: 480, height: 800 },
  });
  try {
    let worker = context.serviceWorkers()[0];
    worker ??= await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.evaluate(async ({ origin }) => {
      await chrome.storage.local.set({
        modelProfiles: [{
          id: "permission-profile", name: "权限测试", provider: "openai-chat",
          baseUrl: `${origin}/v1`, apiKey: "local-placeholder", model: "mock",
          maxOutputTokens: 64, isDefault: true, createdAt: 1, updatedAt: 1,
        }],
      });
    }, { origin: server.origin });
    await panel.reload();

    await panel.getByRole("button", { name: "引用页签" }).click();
    await expect(panel.getByRole("alert")).toHaveText(/页签权限.*请重试授权/);
    await panel.getByRole("button", { name: "引用页签" }).click();
    await expect(panel.getByRole("alert").last()).toContainText("请重试授权");

    await panel.getByRole("button", { name: "设置" }).click();
    await panel.getByRole("button", { name: "测试连接" }).click();
    await expect(panel.getByRole("alert").last()).toContainText("请在设置页重新点击授权");
    expect(server.requests.filter((request) => request.path === "/v1/models")).toHaveLength(0);
    await panel.getByLabel("配置名称").fill("不应保存");
    await panel.getByRole("button", { name: "保存模型" }).click();
    await expect(panel.getByRole("alert").last()).toContainText("请在设置页重新点击授权");
    const profiles = await panel.evaluate(async () => (await chrome.storage.local.get("modelProfiles")).modelProfiles);
    expect(profiles).toEqual([expect.objectContaining({ name: "权限测试" })]);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("当前页问答、停止生成、历史恢复与设置 CRUD", async ({ context, panel, server }) => {
  const article = await openPage(context, `${server.origin}/article`);
  await reloadPanelForActiveTab(panel, article);
  await panel.getByRole("textbox", { name: "向 AI 提问" }).fill("总结当前页");
  await panel.getByRole("button", { name: "发送消息" }).click();
  const disclosure = panel.getByRole("dialog", { name: "发送前确认" });
  await expect(disclosure).toContainText("页面内容、标题、URL 和你的问题会直接发送到你配置的 AI 服务商");
  await expect(disclosure).toContainText("Context Pilot 开发者不接收这些内容");
  expect(server.requests.filter((request) => request.path === "/v1/chat/completions")).toHaveLength(0);
  await disclosure.getByRole("button", { name: "同意并发送" }).click();
  await expect(panel.getByText("当前页总结：北港部署三台潮汐涡轮机，年发电量预计 4.8 吉瓦时。", { exact: true })).toBeVisible();
  await expect(panel.getByText(/输入 84.*输出 22/)).toBeVisible();
  await panel.setViewportSize({ width: 1280, height: 800 });
  await panel.screenshot({ path: join(storeAssetRoot, "screenshots/01-current-page-answer.png") });
  await panel.setViewportSize({ width: 440, height: 280 });
  await panel.screenshot({ path: join(storeAssetRoot, "promo-440x280.png") });
  await panel.setViewportSize({ width: 480, height: 800 });

  await submit(panel, "停止生成并保留文字");
  await expect(panel.getByText(/当前页总结：北港部署/)).toHaveCount(2);
  await panel.getByRole("button", { name: "停止生成" }).click();
  await expect(panel.getByText("已停止", { exact: true })).toBeVisible();

  await panel.getByRole("button", { name: "对话历史" }).click();
  const historyItem = panel.getByRole("button", { name: /^总结当前页 \d+ 条消息$/ });
  await expect(historyItem).toBeVisible();
  await historyItem.click();
  await expect(panel.getByText("当前页总结：北港部署三台潮汐涡轮机，年发电量预计 4.8 吉瓦时。", { exact: true })).toBeVisible();

  await panel.getByRole("button", { name: "设置" }).click();
  await panel.getByRole("option", { name: /本地 OpenAI/ }).click();
  await panel.getByLabel("配置名称").fill("本地 OpenAI 已编辑");
  await panel.getByLabel("模型名称").fill("mock-model-v2");
  await panel.getByLabel("最大输出 Token").fill("2048");
  await panel.getByLabel("温度").fill("0.7");
  await panel.getByLabel("主题").selectOption("dark");
  await expect(panel.locator("html")).toHaveAttribute("data-theme", "dark");
  await panel.getByRole("button", { name: "保存模型" }).click();
  await panel.reload();
  await panel.getByRole("button", { name: "设置" }).click();
  await panel.getByRole("option", { name: /本地 OpenAI 已编辑/ }).click();
  await expect(panel.getByLabel("配置名称")).toHaveValue("本地 OpenAI 已编辑");
  await expect(panel.getByLabel("模型名称")).toHaveValue("mock-model-v2");
  await expect(panel.getByLabel("最大输出 Token")).toHaveValue("2048");
  await expect(panel.getByLabel("温度")).toHaveValue("0.7");
  await expect(panel.getByLabel("主题")).toHaveValue("dark");

  await panel.getByRole("button", { name: "新建配置" }).click();
  await panel.getByLabel("配置名称").fill("本地 Anthropic");
  await panel.getByLabel("API 协议").selectOption("anthropic-messages");
  await panel.getByLabel("API 地址").fill(`${server.origin}/anthropic`);
  await panel.getByLabel("API Key").fill("e2e-anthropic-key");
  await panel.getByLabel("模型名称").fill("mock-claude");
  await panel.getByRole("button", { name: "测试连接" }).click();
  await expect(panel.getByRole("button", { name: "连接正常" })).toBeVisible();
  await panel.getByRole("button", { name: "保存模型" }).click();
  await expect(panel.getByRole("option", { name: /本地 Anthropic/ })).toBeVisible();
  await panel.getByRole("button", { name: "删除配置" }).click();
  await expect(panel.getByRole("option", { name: /本地 Anthropic/ })).toHaveCount(0);
});

test("@ 两页授权后读取 SPA 最新内容，单页失败仍继续联合分析", async ({ context, panel, server }) => {
  const article = await openPage(context, `${server.origin}/article`);
  const spa = await openPage(context, `${server.localhostOrigin}/spa`);
  await spa.getByRole("button", { name: "加载新内容" }).click();
  await reloadPanelForActiveTab(panel, spa);

  await panel.getByRole("button", { name: "引用页签" }).click();
  await panel.getByRole("option", { name: /Article fixture/ }).click();
  await expect(panel.getByLabel("本轮引用页签").getByText("Article fixture")).toBeVisible();
  await panel.getByRole("button", { name: "引用页签" }).click();
  await expect(panel.getByRole("dialog", { name: "选择页签" })).toBeVisible();
  await panel.setViewportSize({ width: 1280, height: 800 });
  const contextAboveComposer = await panel.getByLabel("本轮引用页签").evaluate((element) => {
    const textarea = element.parentElement?.querySelector("textarea");
    if (!(textarea instanceof HTMLElement)) return false;
    return element.getBoundingClientRect().bottom <= textarea.getBoundingClientRect().top;
  });
  expect(contextAboveComposer).toBe(true);
  await panel.screenshot({ path: join(storeAssetRoot, "screenshots/02-tab-selection.png") });
  await panel.setViewportSize({ width: 480, height: 800 });
  await panel.getByRole("combobox", { name: "引用已打开页签" }).press("Escape");
  await submit(panel, "比较两个页面");
  await expect(panel.getByText(/T1 与 T2 的比较结果/)).toBeVisible();
  await expect(panel.getByText(/SPA 已更新为六小时维护窗口/)).toBeVisible();
  const spaRequest = [...server.requests].reverse().find((request) => request.path === "/v1/chat/completions");
  expect(spaRequest?.body).toContain("4.8 吉瓦时");
  expect(spaRequest?.body).toContain("六小时");
  expect(spaRequest?.body).not.toContain("2.1 吉瓦时");
  await panel.setViewportSize({ width: 1280, height: 800 });
  await panel.screenshot({ path: join(storeAssetRoot, "screenshots/03-joint-analysis.png") });
  await panel.setViewportSize({ width: 480, height: 800 });

  await panel.getByRole("button", { name: "新对话" }).click();
  await article.close();
  await submit(panel, "比较两个页面");
  await expect(panel.getByText(/读取失败，已继续分析其他页面/)).toBeVisible();
  await expect(panel.getByText(/T1 与 T2 的比较结果/)).toBeVisible();
});

test("在 360/480/600 宽度及浅深色下没有 DOM 重叠", async ({ context, panel, server }) => {
  const article = await openPage(context, `${server.origin}/article`);
  await reloadPanelForActiveTab(panel, article);
  for (const width of [360, 480, 600]) {
    await panel.setViewportSize({ width, height: 800 });
    for (const scheme of ["light", "dark"] as const) {
      await panel.emulateMedia({ colorScheme: scheme });
      const overlap = await panel.evaluate(() => {
        const toolbar = document.querySelector("header");
        const composer = document.querySelector("textarea");
        if (!(toolbar instanceof HTMLElement) || !(composer instanceof HTMLElement)) return true;
        const top = toolbar.getBoundingClientRect();
        const bottom = composer.getBoundingClientRect();
        return top.right > innerWidth || bottom.right > innerWidth || bottom.left < 0 || top.bottom > bottom.top;
      });
      expect(overlap).toBe(false);
      await panel.screenshot({ path: `test-results/playwright/responsive-${width}-${scheme}.png` });
    }
  }
});
