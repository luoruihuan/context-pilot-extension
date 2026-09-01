# Context Pilot 一期产品与技术设计

## 1. 文档信息

- 日期：2026-09-01
- 状态：已完成方案评审，待进入实施计划
- 暂定产品名：Context Pilot
- 目标平台：桌面版 Google Chrome
- 最低浏览器版本：Chrome 116

## 2. 产品定义

Context Pilot 是一个 Chrome AI 浏览助手。用户可以在 Side Panel 中与 AI 对话，默认引用当前网页，也可以通过 `@` 主动选择多个已打开页签进行联合总结、查找、比较和分析。

一期的单一用途定义为：

> 帮助用户使用其自行配置的 AI 模型理解、比较和分析用户主动选择的浏览器页面内容。

侧边栏、页签引用、页面提取和模型调用均服务于该用途。一期不提供网页自动操作、搜索引擎替换、广告、数据出售或后台浏览行为采集。

## 3. 目标与非目标

### 3.1 一期目标

1. 提供参考 Ask Gemini 心智的原生 Side Panel 对话体验。
2. 默认允许用户针对当前页面提问。
3. 支持通过 `@` 选择最多 10 个已打开页签作为上下文，默认建议不超过 5 个。
4. 支持动态渲染的 SPA 页面，读取发送时已经渲染的 DOM 内容。
5. 支持 OpenAI Chat Completions 和 Anthropic Messages 两种独立协议。
6. 支持用户配置 Base URL、API Key、模型 ID 和基础生成参数。
7. 所有配置和会话默认仅保存在当前浏览器，不经过开发者服务器。
8. 满足 Chrome Web Store 对最小权限、单一用途、数据披露和 Manifest V3 的要求。

### 3.2 一期非目标

- 不实现浏览器原生右键菜单。
- 不实现网页自动点击、表单填写或 Agent 浏览。
- 不实现 PDF 专用解析、YouTube 字幕提取、图片 OCR。
- 不实现联网搜索、RAG 服务、文件上传。
- 不实现账号、订阅、统一计费和云端同步。
- 不实现 Google Gemini 原生协议和 OpenAI Responses API。
- 不保证读取闭合 Shadow DOM、跨域 iframe、Canvas 内部数据和未渲染的虚拟列表内容。

## 4. 核心用户流程

### 4.1 首次使用

1. 用户安装扩展并点击工具栏图标。
2. Chrome 打开 Side Panel。
3. 产品展示简短数据说明：只有用户发送问题时，主动选择的页面内容才会发送给用户配置的 AI 服务商。
4. 用户进入模型设置，选择 OpenAI-compatible 或 Anthropic。
5. 用户填写 Base URL、API Key 和模型 ID，并执行连接测试。
6. 测试成功后回到对话页，当前页默认成为上下文。

### 4.2 当前页提问

1. 用户打开 Side Panel。
2. 输入区上方显示当前页上下文 Chip，清楚标识标题和共享状态。
3. 用户输入问题并发送。
4. 扩展重新读取当前页面的最新渲染 DOM。
5. 页面内容经过清洗、裁剪和安全封装后发送给选定模型。
6. Side Panel 展示流式回答、来源页签和用量估算。

### 4.3 多页签联合分析

1. 用户在输入框键入 `@` 或点击添加页签按钮。
2. 首次使用时，请求可选 `tabs` 权限，并解释该权限只用于显示已打开页签的标题、URL 和图标。
3. 页签选择器按当前页、最近访问顺序展示并支持标题或域名搜索。
4. 用户选择一个或多个页签。
5. 对尚未授权的网站，在用户确认选择后请求对应 origin 的可选 host permission。
6. 每个页签显示等待授权、读取中、已就绪、失败或内容过长状态。
7. 发送时并行提取所有已选择页签；单个页签失败不阻断其他页签。
8. 模型回答中使用 `[T1]`、`[T2]` 等稳定来源编号，并在回答底部展示来源列表。

### 4.4 SPA 页面更新

1. 每次发送前都重新提取，而不是长期复用首次读取结果。
2. 注入提取器后使用短时 MutationObserver 等待 DOM 稳定。
3. 连续 400ms 无子树变化视为稳定，最大等待 3000ms。
4. 若等待期间 URL 变化，取消旧提取并重新开始一次。
5. 使用递增任务 ID 丢弃已经过期的结果。

## 5. 信息架构与 UI

### 5.1 Side Panel 结构

```text
┌──────────────────────────────────┐
│ 品牌       新对话  历史  设置    │
├──────────────────────────────────┤
│ 当前上下文                       │
│ [当前页] [其他页签] [+]          │
├──────────────────────────────────┤
│                                  │
│ 欢迎态 / 对话消息 / 错误状态     │
│                                  │
├──────────────────────────────────┤
│ [@ 引用页签] [模型选择]          │
│ ┌──────────────────────────────┐ │
│ │ 输入问题                    │ │
│ └──────────────────────────────┘ │
│                         [发送]   │
└──────────────────────────────────┘
```

顶部工具使用 Lucide 图标并提供 tooltip。产品不复制 Google 的名称、图标、插画或具体品牌样式，只参考其紧凑、上下文可见、对话优先的结构。

### 5.2 页面状态

- 欢迎态：显示总结、提取要点、查找信息、比较页面四个快捷动作。
- 未配置模型：显示明确的配置入口，不显示不可用的发送按钮。
- 空上下文：允许普通聊天，并提示没有附带页面。
- 提取中：逐页显示进度，布局不跳动。
- 生成中：展示流式内容和停止按钮。
- 部分失败：回答仍可继续，失败页签在来源区标注。
- 权限拒绝：保留页签 Chip，显示重新授权操作。
- 受限页面：说明 Chrome 内置页或商店页不可读取。

### 5.3 `@` 页签选择器

- 输入 `@` 后弹出 combobox。
- 支持键盘上下选择、Enter 确认、Escape 关闭。
- 当前页固定置顶。
- 项目展示 favicon、标题、域名和授权状态。
- 最多选择 10 个页签；达到上限时其他项目禁用。
- 同一页签不能重复加入。
- 输入框中的页签引用使用不可编辑 Chip，Backspace 可删除最后一个 Chip。
- 提交消息后，本轮使用的页签快照固定，不随用户切换页签自动变化。

### 5.4 视觉系统

使用三层设计 Token：primitive、semantic、component。组件禁止直接使用散落的硬编码颜色。

- 字体：系统 UI 字体栈；正文 14px，辅助信息 12px，标题 16px。
- 间距：4px 基础网格。
- 圆角：输入框和面板 8px，按钮 6px，Chip 6px。
- 颜色：中性灰作为主体，蓝绿色作为强调色，错误/警告/成功使用不同语义色。
- 动效：颜色 150ms、位移 200ms；遵循 `prefers-reduced-motion`。
- 主题：浅色、深色和跟随系统。
- 无障碍：正文至少 4.5:1，对焦环至少 3:1；所有操作可键盘完成。

## 6. 权限设计

### 6.1 Manifest 基础权限

```json
{
  "manifest_version": 3,
  "minimum_chrome_version": "116",
  "permissions": ["activeTab", "scripting", "sidePanel", "storage"],
  "optional_permissions": ["tabs"],
  "optional_host_permissions": [
    "https://*/*",
    "http://localhost/*",
    "http://127.0.0.1/*"
  ]
}
```

不申请 `contextMenus`、`history`、`webRequest`、`cookies` 或固定 `<all_urls>` 权限。

### 6.2 权限规则

- `activeTab`：用户点击扩展图标时临时读取当前页。
- `tabs`：仅在用户首次打开 `@` 选择器时请求，用于枚举页签标题、URL 和 favicon。
- 页面 host permission：用户选择非当前页签时，按 origin 请求。
- 模型 host permission：保存模型配置或测试连接时，按 Base URL 的 origin 请求。
- HTTPS 是远程模型的唯一允许协议。
- HTTP 只允许 `localhost` 和 `127.0.0.1`。
- 用户撤销权限后，UI 必须降级而不是静默失败。

## 7. 系统架构

### 7.1 技术栈

- WXT
- React 19 + TypeScript strict
- Vite
- CSS Modules + CSS Custom Properties
- Lucide React
- Mozilla Readability
- Zod
- IndexedDB（会话）
- `chrome.storage.local`（模型配置和用户偏好）
- `chrome.storage.session`（临时提取任务）
- Vitest + Testing Library
- Playwright 或 Puppeteer 扩展端到端测试

一期状态规模不引入 MobX。跨组件状态使用 React Context + reducer；异步业务状态由领域 service 管理。

### 7.2 目录边界

```text
entrypoints/
  background.ts              扩展生命周期、打开侧边栏、消息路由
  sidepanel/                 React Side Panel 入口
src/
  app/                       应用壳、路由和全局 provider
  features/chat/             对话、消息、快捷操作
  features/context/          页签引用、权限、提取状态
  features/settings/         模型配置、连接测试、隐私选项
  features/history/          会话列表和删除
  services/browser/          Chrome API 的类型化封装
  services/extraction/       DOM 清洗、Readability、表格与 SPA 稳定检测
  services/llm/              统一模型接口及两个 provider
  services/storage/          配置、会话和临时任务持久化
  shared/components/         通用 UI 组件
  shared/tokens/             三层设计 Token
  shared/types/              跨领域类型和消息协议
tests/
  fixtures/pages/            静态页、SPA、表格、噪音页样本
  unit/
  integration/
  e2e/
store-assets/                商店描述、隐私说明和截图源文件
```

### 7.3 运行上下文职责

#### Side Panel

- 持有当前可见对话和流式请求。
- 发起模型请求并解析流。
- 管理 `@` 选择器和页签状态。
- 渲染 Markdown，禁止原始 HTML。

#### Background Service Worker

- 设置点击图标打开 Side Panel。
- 处理权限、页签查询和脚本注入请求。
- 校验消息来源、任务 ID、tab ID 和 origin。
- 不持有只能存在于内存的关键状态。

#### 注入提取器

- 只读取页面 DOM，不访问 API Key 或会话。
- 返回结构化 `PageSnapshot`。
- 不向页面注入 UI，不修改页面内容。
- 所有输入和输出都经过 schema 校验。

## 8. 核心数据模型

```ts
type ProviderKind = "openai-chat" | "anthropic-messages";

interface ModelProfile {
  id: string;
  name: string;
  provider: ProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxOutputTokens: number;
  temperature?: number;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

interface TabReference {
  tabId: number;
  windowId: number;
  title: string;
  url: string;
  origin: string;
  favIconUrl?: string;
  isCurrent: boolean;
  permission: "granted" | "required" | "restricted";
}

interface PageSnapshot {
  sourceId: string;
  tabId: number;
  title: string;
  url: string;
  extractedAt: number;
  routeVersion: string;
  selectedText?: string;
  description?: string;
  headings: Array<{ level: number; text: string }>;
  paragraphs: string[];
  lists: string[][];
  tables: Array<{ headers: string[]; rows: string[][] }>;
  plainText: string;
  extractionMethod: "readability" | "visible-text";
  truncated: boolean;
}

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: Array<Pick<PageSnapshot, "sourceId" | "title" | "url" | "extractedAt">>;
  createdAt: number;
  status: "streaming" | "complete" | "stopped" | "error";
}
```

API Key 不进入日志、会话导出、错误详情或内容脚本消息。

## 9. 页面提取与上下文构建

### 9.1 提取算法

1. 验证页面协议，只允许 `http:` 和 `https:`。
2. 记录初始 URL 和任务 ID。
3. 等待 DOM 稳定：quiet 400ms，maximum 3000ms。
4. 克隆当前文档，移除脚本、样式、导航、广告、表单、密码框和不可见节点。
5. 使用 Readability 提取主要正文。
6. 独立提取可见标题、列表和 HTML 表格。
7. Readability 内容不足时退化到 `innerText` 清洗。
8. 检查 URL 与任务 ID；已经过期则拒绝结果。
9. 返回结构化快照，不返回原始 HTML。

开放 Shadow Root 可递归读取可见文本；闭合 Shadow Root 不尝试绕过。

### 9.2 上下文预算

- 默认总输入预算：60,000 字符。
- 单页默认预算：20,000 字符。
- 最多 10 页，超过预算时按选择文本、标题、描述、正文、列表、表格的优先级裁剪。
- 当前页权重高于其他页签。
- 先进行确定性裁剪，一期不额外调用模型生成中间摘要。
- UI 在发送前显示页签数、估算字符数和是否发生裁剪。

### 9.3 Prompt Injection 防护

每个页面内容包装为不可信数据：

```text
<source id="T1" trust="untrusted-web-content">
  <title>...</title>
  <url>...</url>
  <content>...</content>
</source>
```

系统指令明确要求模型忽略页面中试图修改系统行为、索取密钥或执行外部动作的文本。该措施只能降低风险，不能保证模型完全不受注入影响，产品中不作绝对安全承诺。

## 10. 模型适配

### 10.1 统一接口

```ts
interface ChatRequest {
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxOutputTokens: number;
  temperature?: number;
  signal: AbortSignal;
}

type ChatStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
  | { type: "done"; finishReason?: string }
  | { type: "error"; error: ProviderError };

interface ModelProvider {
  testConnection(profile: ModelProfile, signal: AbortSignal): Promise<void>;
  streamChat(profile: ModelProfile, request: ChatRequest): AsyncIterable<ChatStreamEvent>;
}
```

### 10.2 OpenAI Chat Completions

- Endpoint：`{baseUrl}/chat/completions`
- Auth：`Authorization: Bearer <API_KEY>`
- Body：`model`、`messages`、`stream: true`、可选 temperature 和 max token 参数。
- SSE：解析 `choices[].delta.content` 和 `[DONE]`。
- 兼容范围：符合常见 OpenAI Chat Completions JSON/SSE 结构的网关。
- 不承诺兼容只支持 Responses API 或私有扩展字段的服务。

### 10.3 Anthropic Messages

- Endpoint：`{baseUrl}/v1/messages`，默认 Base URL 为 `https://api.anthropic.com`。
- Auth：`x-api-key: <API_KEY>`。
- Headers：`anthropic-version: 2023-06-01`、`content-type: application/json`；直连官方端点时增加 `anthropic-dangerous-direct-browser-access: true`。
- Body：顶层 `system`、`messages`、`model`、`max_tokens`、`stream: true`。
- SSE：解析 `content_block_delta` 中的 `text_delta`，处理 `message_stop` 和 error 事件。

两个 Provider 使用独立的请求转换器、SSE 解析器和错误归一化器，不通过条件分支堆叠在同一大函数中。

### 10.4 错误模型

```ts
type ProviderErrorCode =
  | "AUTH_INVALID"
  | "PERMISSION_REQUIRED"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "MODEL_NOT_FOUND"
  | "CONTEXT_TOO_LARGE"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNSUPPORTED_RESPONSE"
  | "ABORTED"
  | "UNKNOWN";
```

用户界面显示可操作信息，开发日志只记录脱敏后的 provider、状态码、请求 ID 和错误代码。

## 11. 存储、安全与隐私

### 11.1 存储

- `chrome.storage.local`：模型配置、API Key、主题、默认模型、权限说明确认状态。
- `chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })`：阻止内容脚本直接读取。
- IndexedDB：会话和消息正文。
- `chrome.storage.session`：提取任务、临时 TabReference 和跨上下文事件。
- 页面正文默认只在内存中存在，不持久化进会话。

### 11.2 网络安全

- 远程 Base URL 必须为 HTTPS。
- 本地 HTTP 仅允许 localhost 和 127.0.0.1。
- URL 使用 `URL` API 解析，拒绝包含用户名、密码、fragment 或非允许协议的地址。
- 内容脚本不能传入任意 fetch URL，网络请求目标只能来自已保存并验证的 ModelProfile。
- 禁止远程 JavaScript、`eval`、`new Function` 和 CDN 脚本。
- Markdown 禁止 raw HTML，并过滤 `javascript:`、`data:` 等危险链接协议。

### 11.3 用户披露

首次发送前必须显示并取得确认：

> 发送问题时，所选页签的页面内容、标题、URL 和你的问题会直接发送到你配置的 AI 服务商。Context Pilot 开发者不接收这些内容。数据处理仍受该 AI 服务商条款和隐私政策约束。

商店描述、Privacy Tab、隐私政策和产品内说明必须保持一致。

## 12. 测试策略

### 12.1 单元测试

- URL 和 origin 校验。
- 权限请求分组和拒绝后的状态。
- OpenAI SSE 分块、半包、多个 event、错误和 `[DONE]`。
- Anthropic SSE 的文本、usage、stop 和 error 事件。
- 上下文预算、来源编号和裁剪优先级。
- DOM 清洗、Readability 降级、表格提取和不可见文本过滤。
- 存储 schema 的迁移和敏感字段不外泄。

### 12.2 集成测试

- Side Panel 到 Background 的类型化消息。
- `tabs` 可选权限首次允许、拒绝和重新授权。
- 多 origin host permission 请求。
- 多页并行提取及部分失败。
- SPA 路由切换时取消旧任务。
- 流式请求停止、超时和侧边栏关闭。

### 12.3 端到端测试

使用打包后的扩展和独立 Chrome Profile 验证：

1. 安装后点击图标打开 Side Panel。
2. 配置 mock OpenAI 和 Anthropic Server。
3. 当前静态页总结。
4. `@` 选择两个不同 origin 页签并授权。
5. 多页联合回答显示正确来源。
6. SPA 内容更新后读取新内容。
7. 某个页签关闭、冻结、受限或拒绝权限时正确降级。
8. 深色模式、键盘操作、窄宽侧栏和无障碍检查。

### 12.4 手工兼容矩阵

- 普通文章站
- React/Next.js 文档站
- Vue/Nuxt 页面
- 带大型 HTML 表格的页面
- 无限滚动页面
- Gmail/Google Docs 等复杂应用只验证可见文本降级
- Chrome Web Store 和 `chrome://` 受限页面
- 被 discard 的后台页签

## 13. Chrome Web Store 交付物

- 128x128 商店图标。
- 至少三张 1280x800 截图：当前页问答、`@` 多页选择、联合分析回答。
- 440x280 小型宣传图。
- 中文和英文商店描述。
- 稳定 HTTPS 隐私政策。
- 支持邮箱和数据删除说明。
- 所有权限的逐项用途说明。
- 测试说明和限额测试凭证。
- 构建产物不包含远程代码、混淆代码、测试密钥、source map 或开发依赖。

## 14. 验收标准

### 14.1 功能

- 用户可通过工具栏图标打开 Side Panel。
- 用户可创建、测试、编辑和删除两类 ModelProfile。
- 用户可对当前页提问，并收到流式回答。
- 用户输入 `@` 可搜索和选择其他页签。
- 用户可同时引用最多 10 个页签。
- 多页上下文中的来源编号稳定且可回溯到标题和 URL。
- SPA 路由或 DOM 更新后，下一次发送使用最新内容。
- 用户可停止生成、复制回答、重试和清除会话。

### 14.2 安全与隐私

- 内容脚本无法读取 API Key。
- API Key 不出现在 URL、日志、会话导出或错误 UI 中。
- 未经用户选择不会读取后台页签内容。
- 页面内容不会持久化。
- 请求只能发送到用户保存并授权的模型 origin。
- 所有远程代码检查和 CSP 检查通过。

### 14.3 质量

- TypeScript strict 和 lint 无错误。
- 单元与集成测试全部通过。
- Chrome 116 和当前稳定版 Chrome 的关键 E2E 通过。
- 主要交互可完全使用键盘完成。
- 单个页签提取失败不会导致整次联合分析崩溃。
- 模型流中断后保留已生成文本并给出重试操作。

## 15. 实施拆分

实施阶段拆为以下可独立审查的工作包：

1. 工程基础、Manifest、共享类型和设计 Token。
2. 页面提取、SPA 稳定检测和上下文预算。
3. OpenAI 与 Anthropic Provider、SSE 和错误模型。
4. Chrome 权限、页签枚举和跨上下文消息。
5. Side Panel 对话、`@` 选择器、设置和历史 UI。
6. 集成测试、E2E、隐私文档和商店素材。

工作包 2、3 和部分 UI 基础可以在公共类型稳定后由多个子 Agent 并行开发；涉及 Manifest、共享类型和集成状态的修改由主 Agent 统一协调。
