import { expect, test as base, chromium, type BrowserContext, type Page } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startMockAiServer, type MockAiServer } from "./fixtures/mock-ai-server";

const extensionPath = resolve(".output/chrome-mv3");

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
  await expect(panel.getByRole("heading", { name: "Context Pilot" })).toBeVisible();
}

async function submit(panel: Page, question: string): Promise<void> {
  await panel.getByRole("textbox", { name: "向 AI 提问" }).fill(question);
  await panel.getByRole("button", { name: "发送消息" }).click();
}

test("可选页签权限被拒绝后显示可重试提示", async () => {
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
    await panel.evaluate(async () => {
      await chrome.storage.local.set({
        modelProfiles: [{
          id: "permission-profile", name: "权限测试", provider: "openai-chat",
          baseUrl: "http://127.0.0.1:1/v1", apiKey: "local-placeholder", model: "mock",
          maxOutputTokens: 64, isDefault: true, createdAt: 1, updatedAt: 1,
        }],
      });
    });
    await panel.reload();

    await panel.getByRole("button", { name: "引用页签" }).click();
    await expect(panel.getByRole("alert")).toHaveText(/页签权限.*请重试授权/);
    await panel.getByRole("button", { name: "引用页签" }).click();
    await expect(panel.getByRole("alert")).toContainText("请重试授权");
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("当前页问答、停止生成、历史恢复与设置 CRUD", async ({ context, panel, server }) => {
  const article = await openPage(context, `${server.origin}/article`);
  await reloadPanelForActiveTab(panel, article);
  await submit(panel, "总结当前页");
  await expect(panel.getByText("当前页总结：北港部署三台潮汐涡轮机，年发电量预计 4.8 吉瓦时。", { exact: true })).toBeVisible();
  await expect(panel.getByText(/输入 84.*输出 22/)).toBeVisible();
  await panel.setViewportSize({ width: 1280, height: 800 });
  await panel.screenshot({ path: "store-assets/screenshots/01-current-page-answer.png" });
  await panel.setViewportSize({ width: 440, height: 280 });
  await panel.screenshot({ path: "store-assets/promo-440x280.png" });
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
  await expect(panel.getByRole("region", { name: "当前上下文" }).getByText("Article fixture")).toBeVisible();
  await panel.getByRole("button", { name: "引用页签" }).click();
  await expect(panel.getByRole("dialog", { name: "选择页签" })).toBeVisible();
  await panel.setViewportSize({ width: 1280, height: 800 });
  await panel.screenshot({ path: "store-assets/screenshots/02-tab-selection.png" });
  await panel.setViewportSize({ width: 480, height: 800 });
  await panel.getByRole("combobox", { name: "引用已打开页签" }).press("Escape");
  await submit(panel, "比较两个页面");
  await expect(panel.getByText(/T1 与 T2 的比较结果/)).toBeVisible();
  await expect(panel.getByText(/SPA 已更新为六小时维护窗口/)).toBeVisible();
  await panel.setViewportSize({ width: 1280, height: 800 });
  await panel.screenshot({ path: "store-assets/screenshots/03-joint-analysis.png" });
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
