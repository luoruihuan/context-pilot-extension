# Context Pilot V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建可打包安装的 Chrome MV3 AI Side Panel，支持 `@` 多页签联合分析、SPA 页面提取、OpenAI Chat Completions 和 Anthropic Messages BYOK 流式对话。

**Architecture:** WXT 负责 MV3 入口与构建，React Side Panel 持有对话和长连接，Background Service Worker 只协调 Chrome 权限、页签和脚本注入。页面提取、模型 Provider、Chrome API、存储和 UI 通过明确 TypeScript 接口隔离，以便并行开发和独立测试。

**Tech Stack:** WXT、React 19、TypeScript strict、CSS Modules、Lucide React、Mozilla Readability、Zod、IndexedDB、Vitest、Testing Library、Playwright。

**Spec:** `docs/superpowers/specs/2026-09-01-context-pilot-design.md`

## Global Constraints

- 目标平台为桌面版 Google Chrome，`minimum_chrome_version` 固定为 `116`。
- Manifest V3 基础权限仅允许 `activeTab`、`scripting`、`sidePanel`、`storage`；`tabs` 必须是可选权限。
- 不实现浏览器右键菜单，不申请 `contextMenus`。
- 后台页签和模型 origin 必须由用户动作触发可选权限申请。
- 远程模型只允许 HTTPS；HTTP 只允许 `localhost` 和 `127.0.0.1`。
- 页面正文不持久化；API Key 不进入日志、URL、消息导出或内容脚本。
- 禁止远程 JavaScript、`eval`、`new Function`、CDN 脚本和 Markdown raw HTML。
- 所有源文件使用 UTF-8 无 BOM；TypeScript 启用 strict，禁止业务代码使用 `any`。
- UI 使用三层设计 Token、4px 间距网格、最大 8px 圆角和 Lucide 图标。
- 每个任务遵循测试先行，并在完成后提交一个独立 Git commit。

---

## File Map

```text
package.json / wxt.config.ts             工具链与 Manifest
entrypoints/background.ts                扩展生命周期和消息路由
entrypoints/sidepanel/*                  React Side Panel 入口
src/shared/types/*                       全局稳定契约
src/shared/tokens/*                      三层设计 Token
src/services/extraction/*                页面读取和上下文预算
src/services/llm/*                       Provider 与 SSE
src/services/browser/*                   权限、页签和消息客户端
src/services/storage/*                   配置与会话持久化
src/features/context/*                   @ 页签选择和来源状态
src/features/chat/*                      输入、消息和发送编排
src/features/settings/*                  模型配置
src/features/history/*                   会话历史
tests/unit/*                              纯逻辑单测
tests/integration/*                       跨模块测试
tests/e2e/*                               打包扩展端到端测试
store-assets/*                            商店描述与隐私材料
```

## Task 1: 工程骨架与共享契约

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wxt.config.ts`
- Create: `vitest.config.ts`
- Create: `eslint.config.js`
- Create: `entrypoints/background.ts`
- Create: `entrypoints/sidepanel/index.html`
- Create: `entrypoints/sidepanel/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/shared/types/domain.ts`
- Create: `src/shared/types/messages.ts`
- Create: `src/shared/tokens/tokens.css`
- Create: `tests/unit/domain.test.ts`

**Interfaces:**
- Produces: `ModelProfile`、`TabReference`、`PageSnapshot`、`ChatTurn`、`ChatRequest`、`ChatStreamEvent`、`ProviderError`。
- Produces: discriminated union `ExtensionRequest` / `ExtensionResponse`，供 Background 与 Side Panel 共用。

- [ ] **Step 1: 创建领域契约失败测试**

```ts
import { describe, expect, it } from "vitest";
import { modelProfileSchema, pageSnapshotSchema } from "@/shared/types/domain";

describe("domain schemas", () => {
  it("rejects an invalid provider", () => {
    expect(() => modelProfileSchema.parse({ provider: "gemini" })).toThrow();
  });

  it("accepts a minimal page snapshot", () => {
    const result = pageSnapshotSchema.parse({
      sourceId: "T1", tabId: 1, title: "Page", url: "https://example.com",
      extractedAt: 1, routeVersion: "https://example.com", headings: [],
      paragraphs: ["Body"], lists: [], tables: [], plainText: "Body",
      extractionMethod: "readability", truncated: false,
    });
    expect(result.sourceId).toBe("T1");
  });
});
```

- [ ] **Step 2: 安装依赖并验证测试失败**

Run: `pnpm install && pnpm vitest run tests/unit/domain.test.ts`

Expected: FAIL，提示 `@/shared/types/domain` 不存在。

- [ ] **Step 3: 实现工程配置、Manifest 和类型**

`wxt.config.ts` 必须生成：

```ts
export default defineConfig({
  srcDir: ".",
  manifest: {
    name: "Context Pilot",
    description: "使用自有 AI 模型理解和比较主动选择的网页内容。",
    minimum_chrome_version: "116",
    permissions: ["activeTab", "scripting", "sidePanel", "storage"],
    optional_permissions: ["tabs"],
    optional_host_permissions: [
      "https://*/*",
      "http://localhost/*",
      "http://127.0.0.1/*",
    ],
    action: { default_title: "打开 Context Pilot" },
  },
});
```

`background.ts` 只初始化 storage access level，并配置 action 打开 Side Panel。`App.tsx` 暂时渲染可访问的应用壳。Token 文件定义 primitive、semantic、component 和 dark theme 四层区段。

- [ ] **Step 4: 运行静态检查和单测**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run tests/unit/domain.test.ts && pnpm build`

Expected: 全部退出码为 0，`.output/chrome-mv3/manifest.json` 权限与规格一致。

- [ ] **Step 5: 提交基础里程碑**

```bash
git add package.json pnpm-lock.yaml tsconfig.json wxt.config.ts vitest.config.ts eslint.config.js entrypoints src tests
git commit -m "chore: scaffold Context Pilot extension"
```

## Task 2: 页面提取与 SPA 稳定检测

**Files:**
- Create: `src/services/extraction/wait-for-stable-dom.ts`
- Create: `src/services/extraction/clean-document.ts`
- Create: `src/services/extraction/extract-page.ts`
- Create: `src/services/extraction/context-budget.ts`
- Create: `src/services/extraction/index.ts`
- Create: `tests/fixtures/pages/article.html`
- Create: `tests/fixtures/pages/noisy-page.html`
- Create: `tests/fixtures/pages/table.html`
- Create: `tests/unit/extraction.test.ts`
- Create: `tests/unit/context-budget.test.ts`

**Interfaces:**
- Consumes: `PageSnapshot` from `src/shared/types/domain.ts`.
- Produces: `waitForStableDom(options): Promise<void>`。
- Produces: `extractPage(input: ExtractPageInput): Promise<PageSnapshot>`。
- Produces: `buildContext(snapshots, limits): BuiltContext`，其中 `BuiltContext` 包含 `text`、`sources`、`totalCharacters`、`truncated`。

- [ ] **Step 1: 编写提取失败测试**

```ts
it("removes navigation and extracts article text", async () => {
  document.documentElement.innerHTML = fixture("article.html");
  const snapshot = await extractPage({ tabId: 7, sourceId: "T1", document, locationHref: "https://example.com/a" });
  expect(snapshot.plainText).toContain("Main article paragraph");
  expect(snapshot.plainText).not.toContain("Navigation item");
});

it("extracts HTML tables", async () => {
  document.documentElement.innerHTML = fixture("table.html");
  const snapshot = await extractPage({ tabId: 7, sourceId: "T1", document, locationHref: "https://example.com/table" });
  expect(snapshot.tables[0]).toEqual({ headers: ["Name", "Value"], rows: [["Alpha", "42"]] });
});
```

- [ ] **Step 2: 运行提取测试确认失败**

Run: `pnpm vitest run tests/unit/extraction.test.ts tests/unit/context-budget.test.ts`

Expected: FAIL，提取模块不存在。

- [ ] **Step 3: 实现稳定检测和结构化提取**

实现必须满足：DOM quiet 400ms、max 3000ms；清除 `script/style/nav/form/input/textarea/select` 和不可见节点；Readability 失败时回退可见文本；提取标题、描述、heading、list、table；返回前比较 URL 和任务 ID。

上下文格式固定为：

```text
<source id="T1" trust="untrusted-web-content">
<title>Example</title>
<url>https://example.com</url>
<content>...</content>
</source>
```

- [ ] **Step 4: 验证提取、预算和类型**

Run: `pnpm vitest run tests/unit/extraction.test.ts tests/unit/context-budget.test.ts && pnpm typecheck`

Expected: 全部 PASS；10 页超过 60,000 字符时确定性裁剪并保留所有来源元数据。

- [ ] **Step 5: 提交提取模块**

```bash
git add src/services/extraction tests/fixtures/pages tests/unit/extraction.test.ts tests/unit/context-budget.test.ts
git commit -m "feat: extract SPA page context"
```

## Task 3: OpenAI 与 Anthropic Provider

**Files:**
- Create: `src/services/llm/provider.ts`
- Create: `src/services/llm/sse.ts`
- Create: `src/services/llm/openai-chat-provider.ts`
- Create: `src/services/llm/anthropic-messages-provider.ts`
- Create: `src/services/llm/provider-registry.ts`
- Create: `src/services/llm/url-policy.ts`
- Create: `tests/unit/sse.test.ts`
- Create: `tests/unit/openai-provider.test.ts`
- Create: `tests/unit/anthropic-provider.test.ts`
- Create: `tests/unit/url-policy.test.ts`

**Interfaces:**
- Consumes: `ModelProfile`、`ChatRequest`、`ChatStreamEvent`、`ProviderError`。
- Produces: `ModelProvider` implementations and `getProvider(kind): ModelProvider`。
- Produces: `validateModelBaseUrl(value): { url: URL; originPattern: string }`。

- [ ] **Step 1: 编写 SSE 和 URL 策略失败测试**

```ts
it("parses OpenAI chunks split across network boundaries", async () => {
  const chunks = ["data: {\"choices\":[{\"delta\":{\"con", "tent\":\"Hi\"}}]}\n\ndata: [DONE]\n\n"];
  expect(await collectOpenAI(chunks)).toEqual(["Hi"]);
});

it("allows HTTPS and local HTTP only", () => {
  expect(validateModelBaseUrl("https://api.example.com/v1").originPattern).toBe("https://api.example.com/*");
  expect(() => validateModelBaseUrl("http://api.example.com/v1")).toThrow();
  expect(validateModelBaseUrl("http://localhost:11434/v1").url.port).toBe("11434");
});
```

- [ ] **Step 2: 运行 Provider 测试确认失败**

Run: `pnpm vitest run tests/unit/sse.test.ts tests/unit/openai-provider.test.ts tests/unit/anthropic-provider.test.ts tests/unit/url-policy.test.ts`

Expected: FAIL，Provider 模块不存在。

- [ ] **Step 3: 实现双协议 Provider**

OpenAI 请求必须使用 Bearer auth 和 `/chat/completions`；Anthropic 请求必须使用 `x-api-key`、`anthropic-version: 2023-06-01`、`/v1/messages`，官方 origin 增加 `anthropic-dangerous-direct-browser-access: true`。两个 parser 必须容忍 CRLF、半包、未知 event 和 JSON error event，并通过 `AbortSignal` 停止 fetch。

- [ ] **Step 4: 验证请求、流和错误归一化**

Run: `pnpm vitest run tests/unit/sse.test.ts tests/unit/openai-provider.test.ts tests/unit/anthropic-provider.test.ts tests/unit/url-policy.test.ts && pnpm typecheck`

Expected: 全部 PASS；测试覆盖 401、404、429、context length、网络失败和 abort。

- [ ] **Step 5: 提交模型模块**

```bash
git add src/services/llm tests/unit/sse.test.ts tests/unit/openai-provider.test.ts tests/unit/anthropic-provider.test.ts tests/unit/url-policy.test.ts
git commit -m "feat: support OpenAI and Anthropic streaming"
```

## Task 4: 本地配置与会话存储

**Files:**
- Create: `src/services/storage/chrome-storage.ts`
- Create: `src/services/storage/model-profile-repository.ts`
- Create: `src/services/storage/conversation-db.ts`
- Create: `src/services/storage/preferences-repository.ts`
- Create: `src/services/storage/index.ts`
- Create: `tests/unit/model-profile-repository.test.ts`
- Create: `tests/unit/conversation-db.test.ts`

**Interfaces:**
- Consumes: `ModelProfile`、`ChatTurn`。
- Produces: `ModelProfileRepository` CRUD、default profile invariant。
- Produces: `ConversationRepository` CRUD；持久化消息来源元数据，但不持久化 `PageSnapshot.plainText`。
- Produces: `PreferencesRepository` for theme and disclosure acceptance。

- [ ] **Step 1: 编写存储失败测试**

```ts
it("keeps only one default model profile", async () => {
  await repository.save(profile({ id: "a", isDefault: true }));
  await repository.save(profile({ id: "b", isDefault: true }));
  expect((await repository.list()).filter(item => item.isDefault).map(item => item.id)).toEqual(["b"]);
});

it("does not persist page body content", async () => {
  await conversations.save(conversationWithSourceMetadata());
  expect(JSON.stringify(await conversations.get("c1"))).not.toContain("secret page body");
});
```

- [ ] **Step 2: 运行存储测试确认失败**

Run: `pnpm vitest run tests/unit/model-profile-repository.test.ts tests/unit/conversation-db.test.ts`

Expected: FAIL，repository 不存在。

- [ ] **Step 3: 实现 repository 和 schema version**

模型配置放 `chrome.storage.local` 并在初始化时设置 `TRUSTED_CONTEXTS`。会话使用 IndexedDB，数据库名 `context-pilot`，version 1，object store 为 `conversations`。repository 对外返回副本，禁止内容脚本 import 存储入口。

- [ ] **Step 4: 验证持久化和类型**

Run: `pnpm vitest run tests/unit/model-profile-repository.test.ts tests/unit/conversation-db.test.ts && pnpm typecheck`

Expected: 全部 PASS。

- [ ] **Step 5: 提交存储模块**

```bash
git add src/services/storage tests/unit/model-profile-repository.test.ts tests/unit/conversation-db.test.ts
git commit -m "feat: persist models and conversations locally"
```

## Task 5: Chrome 权限、页签和 Background 消息

**Files:**
- Modify: `entrypoints/background.ts`
- Create: `src/services/browser/chrome-adapter.ts`
- Create: `src/services/browser/permission-service.ts`
- Create: `src/services/browser/tab-service.ts`
- Create: `src/services/browser/extraction-client.ts`
- Create: `src/services/browser/runtime-client.ts`
- Create: `src/services/browser/index.ts`
- Create: `tests/unit/permission-service.test.ts`
- Create: `tests/integration/background-messages.test.ts`

**Interfaces:**
- Consumes: `ExtensionRequest` / `ExtensionResponse` and extraction `extractPage` function file injection。
- Produces: `listTabs()`、`requestTabsPermission()`、`requestOriginPermission(origin)`、`extractTabs(tabIds)`。
- Produces: validated Background message router，不接受 content script 提供任意网络 URL。

- [ ] **Step 1: 编写权限和消息失败测试**

```ts
it("requests only the selected HTTPS origin", async () => {
  await service.requestPageOrigin("https://docs.example.com/a");
  expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ["https://docs.example.com/*"] });
});

it("rejects extraction from restricted schemes", async () => {
  await expect(router.handle({ type: "EXTRACT_TABS", tabIds: [3] }, senderFor("chrome://settings"))).resolves.toMatchObject({ ok: false, error: "RESTRICTED_PAGE" });
});
```

- [ ] **Step 2: 运行浏览器服务测试确认失败**

Run: `pnpm vitest run tests/unit/permission-service.test.ts tests/integration/background-messages.test.ts`

Expected: FAIL，浏览器服务不存在。

- [ ] **Step 3: 实现类型化 Chrome 适配层**

所有 callback/Promise 差异封装在 `chrome-adapter.ts`。`tab-service` 只返回 http/https TabReference。并行提取使用 `Promise.allSettled`，结果按用户选择顺序返回。Background 验证 request schema、sender extension ID、tab ID、URL scheme 和已授权 origin。

- [ ] **Step 4: 验证权限、部分失败和构建 Manifest**

Run: `pnpm vitest run tests/unit/permission-service.test.ts tests/integration/background-messages.test.ts && pnpm build`

Expected: 全部 PASS；Manifest 没有新增非规格权限。

- [ ] **Step 5: 提交 Chrome 集成**

```bash
git add entrypoints/background.ts src/services/browser tests/unit/permission-service.test.ts tests/integration/background-messages.test.ts
git commit -m "feat: coordinate tab permissions and extraction"
```

## Task 6: Side Panel UI、设置和 `@` 页签引用

**Files:**
- Modify: `src/app/App.tsx`
- Create: `src/app/app.module.css`
- Create: `src/app/AppProvider.tsx`
- Create: `src/shared/components/IconButton.tsx`
- Create: `src/shared/components/StatusBadge.tsx`
- Create: `src/features/context/TabMentionPicker.tsx`
- Create: `src/features/context/ContextChips.tsx`
- Create: `src/features/context/context-reducer.ts`
- Create: `src/features/settings/SettingsView.tsx`
- Create: `src/features/settings/ModelProfileForm.tsx`
- Create: `src/features/chat/ChatView.tsx`
- Create: `src/features/chat/Composer.tsx`
- Create: `src/features/chat/MessageList.tsx`
- Create: `src/features/history/HistoryView.tsx`
- Create: `tests/unit/context-reducer.test.ts`
- Create: `tests/integration/tab-mention-picker.test.tsx`
- Create: `tests/integration/model-profile-form.test.tsx`

**Interfaces:**
- Consumes: browser service、storage repositories、Provider registry and shared types。
- Produces: keyboard-accessible `TabMentionPicker` with maximum 10 unique tabs。
- Produces: settings CRUD and connection test UI。

- [ ] **Step 1: 编写 reducer 和交互失败测试**

```tsx
it("opens tab picker when the user types @", async () => {
  render(<Composer tabs={tabs} onSubmit={vi.fn()} />);
  await userEvent.type(screen.getByRole("textbox"), "@");
  expect(screen.getByRole("combobox", { name: "引用已打开页签" })).toBeVisible();
});

it("prevents selecting more than ten unique tabs", () => {
  const state = tenTabState();
  expect(contextReducer(state, { type: "add", tab: extraTab })).toBe(state);
});
```

- [ ] **Step 2: 运行 UI 测试确认失败**

Run: `pnpm vitest run tests/unit/context-reducer.test.ts tests/integration/tab-mention-picker.test.tsx tests/integration/model-profile-form.test.tsx`

Expected: FAIL，组件不存在。

- [ ] **Step 3: 实现响应式 Side Panel UI**

应用只使用无嵌套卡片的单列工作区。顶部图标按钮固定 32px；上下文 Chip 不改变输入区域高度；composer 固定最小/最大高度；`@` picker 使用 ARIA combobox/listbox；未配置、权限拒绝、受限页、读取中、部分失败、流式中和停止状态均有完整 UI。

- [ ] **Step 4: 验证 UI、键盘和窄宽布局**

Run: `pnpm vitest run tests/unit/context-reducer.test.ts tests/integration/tab-mention-picker.test.tsx tests/integration/model-profile-form.test.tsx && pnpm typecheck && pnpm lint`

Expected: 全部 PASS；测试覆盖 ArrowUp/ArrowDown/Enter/Escape/Backspace。

- [ ] **Step 5: 提交 Side Panel UI**

```bash
git add src/app src/shared/components src/features tests/unit/context-reducer.test.ts tests/integration/tab-mention-picker.test.tsx tests/integration/model-profile-form.test.tsx
git commit -m "feat: build side panel tab mention experience"
```

## Task 7: 对话编排与多页上下文集成

**Files:**
- Create: `src/features/chat/chat-controller.ts`
- Create: `src/features/chat/chat-reducer.ts`
- Create: `src/features/chat/prompt-builder.ts`
- Modify: `src/features/chat/ChatView.tsx`
- Modify: `src/features/chat/Composer.tsx`
- Modify: `src/app/AppProvider.tsx`
- Create: `tests/unit/prompt-builder.test.ts`
- Create: `tests/integration/chat-controller.test.ts`
- Create: `tests/integration/multi-tab-chat.test.tsx`

**Interfaces:**
- Consumes: extraction client、`buildContext`、Provider registry、conversation repository。
- Produces: `ChatController.send(input)` and `ChatController.stop()`。
- Guarantees: 单页失败不取消其他页；停止保留已有文本；页面正文不会传给 repository。

- [ ] **Step 1: 编写联合分析失败测试**

```ts
it("continues when one selected tab cannot be extracted", async () => {
  extraction.extractTabs.mockResolvedValue([
    { ok: true, snapshot: snapshot("T1", "Alpha") },
    { ok: false, tabId: 2, error: "TAB_DISCARDED" },
  ]);
  await controller.send({ text: "比较两个页面", tabIds: [1, 2], profileId: "p1" });
  expect(provider.streamChat).toHaveBeenCalled();
  expect(controller.getState().sourceErrors).toHaveLength(1);
});
```

- [ ] **Step 2: 运行编排测试确认失败**

Run: `pnpm vitest run tests/unit/prompt-builder.test.ts tests/integration/chat-controller.test.ts tests/integration/multi-tab-chat.test.tsx`

Expected: FAIL，controller 不存在。

- [ ] **Step 3: 实现发送状态机**

状态顺序为 `idle -> extracting -> streaming -> complete|stopped|error`。发送时固定页签选择快照、分配稳定 T 编号、提取、预算裁剪、构建防注入 system prompt、调用 Provider、累计 delta、记录 usage，最后仅持久化消息和来源元数据。

- [ ] **Step 4: 验证全链路集成**

Run: `pnpm vitest run tests/unit/prompt-builder.test.ts tests/integration/chat-controller.test.ts tests/integration/multi-tab-chat.test.tsx && pnpm typecheck`

Expected: 全部 PASS；覆盖 retry、abort、部分失败、context too large 和 provider error。

- [ ] **Step 5: 提交对话集成**

```bash
git add src/features/chat src/app/AppProvider.tsx tests/unit/prompt-builder.test.ts tests/integration/chat-controller.test.ts tests/integration/multi-tab-chat.test.tsx
git commit -m "feat: orchestrate multi-tab AI conversations"
```

## Task 8: E2E、商店合规与最终验收

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures/mock-ai-server.ts`
- Create: `tests/e2e/fixtures/test-pages.ts`
- Create: `tests/e2e/extension.spec.ts`
- Create: `store-assets/README.md`
- Create: `store-assets/description.zh-CN.md`
- Create: `store-assets/description.en.md`
- Create: `store-assets/privacy-policy.zh-CN.md`
- Create: `store-assets/privacy-practices.md`
- Create: `store-assets/reviewer-instructions.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: 打包后的 `.output/chrome-mv3`。
- Produces: 可重复的 Chrome 扩展 E2E、商店文案、隐私说明和审核步骤。

- [ ] **Step 1: 编写当前页、双页签和 SPA E2E**

```ts
test("analyzes two selected tabs after SPA content changes", async ({ context }) => {
  const article = await context.newPage();
  const spa = await context.newPage();
  await article.goto(testPages.article);
  await spa.goto(testPages.spa);
  await spa.getByRole("button", { name: "加载新内容" }).click();
  const panel = await openSidePanel(context);
  await configureMockOpenAI(panel, mockServer.url);
  await mentionTabs(panel, ["Article fixture", "SPA fixture"]);
  await panel.getByRole("textbox").fill("比较两个页面");
  await panel.getByRole("button", { name: "发送" }).click();
  await expect(panel.getByText("T1 与 T2 的比较结果")).toBeVisible();
});
```

- [ ] **Step 2: 运行 E2E 确认失败**

Run: `pnpm build && pnpm playwright test tests/e2e/extension.spec.ts`

Expected: FAIL，mock server 和 E2E helper 尚未实现。

- [ ] **Step 3: 实现 E2E fixture 和商店材料**

Mock server 必须覆盖 OpenAI 与 Anthropic SSE。商店材料如实说明 website content、authentication information、tabs 权限、可选 host permission、无开发者中转服务器和 Limited Use。审核说明提供本地 mock 模式或限额凭证的确定操作步骤。

- [ ] **Step 4: 执行完整验证**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run --coverage && pnpm build && pnpm playwright test`

Expected: 全部退出码为 0；构建产物权限与规格一致；搜索构建产物不包含 `eval(`、`new Function`、远程脚本和测试密钥。

- [ ] **Step 5: 人工浏览器验收**

在独立 Chrome Profile 中加载 `.output/chrome-mv3`，检查 360px、480px 和 600px Side Panel 宽度、浅色/深色、当前页、双页签、权限拒绝、SPA 更新、停止生成和历史恢复。记录所有发现并在提交前修复。

- [ ] **Step 6: 提交交付基线**

```bash
git add playwright.config.ts tests/e2e store-assets README.md
git commit -m "test: verify extension and prepare store submission"
```

## Parallel Execution Schedule

1. 主 Agent 串行完成 Task 1，稳定工具链和共享契约。
2. Task 1 通过后并行分派：Agent A 完成 Task 2；Agent B 完成 Task 3；Agent C 完成 Task 4。
3. 主 Agent 在并行期间完成 Task 5，并负责处理共享接口调整。
4. 第一轮合并与全量测试后，Agent A 完成 Task 6；主 Agent 完成 Task 7。
5. Agent B 审查权限/安全和 Provider；Agent C 准备 Task 8 的合规材料；主 Agent 完成 E2E 集成与最终验收。

## Plan Self-Review Result

- Spec coverage：一期所有目标、非目标、权限、SPA、双协议、存储、UI、测试和上架材料均映射到 Task 1-8。
- Placeholder scan：无 TBD、TODO、模糊“适当处理”或未定义接口。
- Type consistency：领域类型只在 Task 1 定义；后续任务均消费同名接口；`ChatController`、`ModelProvider`、repository 和 browser service 的职责不重叠。

