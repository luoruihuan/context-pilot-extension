# Context Pilot

Context Pilot 是一个基于 Chrome Side Panel 的 AI 浏览助手。它允许用户通过 `@` 引用当前打开的一个或多个页签，并使用自有的 OpenAI-compatible 或 Anthropic API 对网页内容进行总结、检索、比较和分析。

当前状态：一期可构建、可测试的 Chrome MV3 扩展。

## 环境要求

- Node.js 20 或更高版本
- pnpm 10
- Chrome 116 或更高版本

## 安装与构建

```bash
pnpm install
pnpm build
```

构建产物位于 `.output/chrome-mv3`。打开 `chrome://extensions`，开启开发者模式，选择“加载已解压的扩展程序”，然后选择该目录。打开普通网页并点击工具栏图标，即可在 Side Panel 使用 Context Pilot。

## BYOK 模型配置

Context Pilot 不提供代理或中转服务。进入“设置”创建模型配置：

- OpenAI Chat Completions：填写兼容服务的 base URL、API Key 和模型名。
- Anthropic Messages：填写 Anthropic-compatible base URL、API Key 和模型名。

生产模型地址必须使用 HTTPS；仅本地开发允许 `http://localhost` 或 `http://127.0.0.1`。网页内容和问题直接发送到用户配置的模型服务。

## 权限与隐私

必选权限为 `activeTab`、`scripting`、`sidePanel` 和 `storage`。`tabs` 与页面/模型 origin host permissions 均为可选权限，只在用户打开 `@` 选择器、选择额外页面或配置模型 origin 时请求。API Key 保存在浏览器本地受信任扩展上下文；网页正文不持久化，开发者不会收到 API Key、正文或对话。

完整上架隐私与权限说明见 [store-assets](store-assets/README.md)。

## 测试

```bash
pnpm typecheck
pnpm lint
pnpm vitest run --coverage
pnpm build
pnpm playwright test
```

首次运行 E2E 前安装配套 Chromium：

```bash
pnpm playwright install chromium
```

Playwright 使用独立的临时 persistent profile、打包扩展和短生命周期本地 mock server，不需要启动常驻开发服务器。由于浏览器工具栏和 Side Panel 容器不属于网页 DOM，自动化直接加载同一打包 `sidepanel.html`，并在临时扩展副本中预授予生产 manifest 已声明的可选权限；真实权限弹窗与工具栏打开行为需按审核说明人工复核。

## 文档

- [一期产品与技术设计](docs/superpowers/specs/2026-09-01-context-pilot-design.md)
