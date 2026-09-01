# Task 8：E2E、商店合规与最终验收报告

## 交付状态

完成。新增 Playwright 扩展 E2E、双协议 mock server、覆盖率配置、历史恢复链路、商店素材/文案及 README。生产 manifest 权限未扩大。

## TDD RED / GREEN

### RED 1：E2E 工具链

先创建 `playwright.config.ts`、`tests/e2e/fixtures/*` 和 `tests/e2e/extension.spec.ts`，再运行 brief 指定命令：

```text
pnpm build && pnpm playwright test tests/e2e/extension.spec.ts
```

结果：`pnpm build` 成功；随后退出码 1，`error: unknown command 'test'`。原因是项目尚未安装 `@playwright/test`，符合测试基础设施缺失的预期 RED。

### RED 2：历史恢复

先新增 `ChatController` 恢复持久化会话的集成测试，再运行：

```text
pnpm vitest run tests/integration/chat-controller.test.ts
```

结果：10 个既有用例通过，新增用例唯一失败为 `controller.restore is not a function`。随后最小新增 `restore` reducer action/controller 方法，并将 `ConversationRepository.list/get/delete` 接入既有历史 UI；复跑 11/11 通过。

### GREEN

最终串联命令退出码 0：

```text
pnpm typecheck && pnpm lint && pnpm vitest run --coverage && pnpm build && pnpm playwright test
```

- TypeScript strict：通过。
- ESLint：通过。
- Vitest：17 files、102 tests 全通过。
- V8 coverage：statements 80.14%、branches 78.23%、functions 83.33%、lines 80.14%。
- WXT production build：通过，`.output/chrome-mv3` 总计 408.48 kB。
- Playwright：4/4 通过，19.1 秒；素材调整后复跑仍为 4/4 通过。

## E2E 环境与真实覆盖

- Playwright Chromium 151，独立临时 persistent profile；每个测试结束删除 profile。
- 加载 WXT 生产构建 `.output/chrome-mv3` 的代码与页面。
- Chrome Side Panel 容器和工具栏不属于网页 DOM，因此主工作流直接打开同一打包 `chrome-extension://<id>/sidepanel.html`。为替代工具栏点击产生的 `activeTab` 和不可自动化的原生授权弹窗，主工作流只在临时扩展副本中把生产 manifest 已声明的 optional `tabs`/host permissions 预授予；生产构建不变。
- 权限拒绝测试另行加载未修改的生产 manifest，并使用 Chromium `--deny-permission-prompts` 真实触发可选 `tabs` 请求失败；两次点击均显示“请重试授权”。
- fixture server 监听随机 localhost 端口，测试结束立即关闭，不需要常驻 dev server。

实际自动化覆盖：

1. 当前静态文章提取、OpenAI Chat Completions SSE 分包、usage、`[DONE]` 和回答显示。
2. 生成过程中停止，已生成文字与“已停止”状态保留。
3. 历史列表加载与会话恢复。
4. 模型配置创建、Anthropic `/v1/models` 测试连接、保存和删除。
5. `@` 选择两个不同 origin 页签；SPA `pushState` 和 DOM 更新后重新提取最新内容。
6. 关闭一个已选页签后显示单页失败提示，仍使用其余来源完成联合分析。
7. 360/480/600 宽度，浅色/深色，共 6 组 DOM 边界与 toolbar/composer overlap 断言及截图。
8. 原始 optional permission 被拒绝后的重试提示。

Mock server 同时实现 OpenAI `/v1/chat/completions` 与 Anthropic `/v1/messages` SSE，均含拆包、usage 和终止事件。Anthropic 流解析另由既有 provider 单测覆盖；本轮 E2E 对 Anthropic 验证了真实设置与连接路径，聊天主链使用 OpenAI SSE。

## 商店素材

- `store-assets/icon-source.svg`：charcoal + teal + coral、无渐变、无文字、双页签与 compass/focus 图形。
- `store-assets/icon-128.png`：128×128。
- `store-assets/promo-440x280.png`：440×280，来自真实扩展 UI。
- `store-assets/screenshots/01-current-page-answer.png`：1280×800。
- `store-assets/screenshots/02-tab-selection.png`：1280×800，真实打开 `@` picker。
- `store-assets/screenshots/03-joint-analysis.png`：1280×800。

三张截图均由上述通过的 E2E 运行直接生成并人工查看，无概念图、无文本重叠。

商店材料包括中英文描述、中文隐私政策源文、Privacy Practices、审核说明、逐项权限用途、website content/authentication information、Limited Use、无开发者中转、支持和删除说明。未编造线上 URL 或邮箱；清单明确要求上架前把隐私政策发布到稳定公开 HTTPS 地址，并补真实支持邮箱与审核期凭证。

## Manifest 与构建扫描

生产 manifest：

- 必选：`activeTab`、`scripting`、`sidePanel`、`storage`。
- 可选：`tabs`。
- 可选 host：`https://*/*`、`http://localhost/*`、`http://127.0.0.1/*`。
- 无必选 `host_permissions`，未新增 cookies/history/webRequest 等权限。

对 `.output/chrome-mv3` 重新扫描：

- 无 `eval(` 或 `new Function`。
- 无远程 JavaScript URL；`sidepanel.html` 只引用相对路径本地 chunk。
- 无 `e2e-local-key`、`test-api-key` 或其他测试凭证标识。
- 无 `sourceMappingURL`，无 `.map` 文件。
- 输出仅含 manifest、HTML、本地 JS chunk、CSS 和提取脚本，不含开发依赖。

## 仍需人工完成

1. Chrome 116 和当前稳定版 Chrome 中，通过真实工具栏图标打开 Side Panel。
2. 原生权限弹窗的允许路径、拒绝路径和不同 origin 分组文案；自动化仅能验证拒绝提示与预授权后的业务链。
3. `chrome://`、Chrome Web Store、discarded 页签、Gmail/Google Docs 和大型无限滚动页的兼容矩阵。
4. 上架前发布稳定 HTTPS 隐私政策、配置真实支持邮箱/支持页，并向审核方私下提供限额 HTTPS 测试凭证。

以上项目未伪造为自动化通过，不影响本地构建和可重复 E2E 基线。

## Reviewer 修复（P0/P1/P2）

### 补充 RED 证据

1. 模型 origin 权限：先新增 background message 集成测试，初次返回 `INVALID_REQUEST`，证明运行时缺少 `context-pilot/request-origin-permission` 路由。
2. 保存失败反馈：先新增 `ModelProfileForm` 集成测试，保存 Promise 拒绝后初次找不到 `role="alert"`。
3. 删除当前会话：先新增 `ChatController` 集成测试，初次缺少 `controller.forgetConversation`；补齐方法后继续加强断言，确认仅清 ID 仍会让下一次保存包含已删除会话的“旧问题”，随后改为重置当前会话 identity、turns 和状态。
4. 生产 manifest 权限拒绝：在未修改 manifest、Chromium `--deny-permission-prompts` 环境中，首次模型 origin 拒绝只显示 `The browser operation failed`，随后统一为中文“需要授权模型服务地址。请重试授权。”。

### 修复结果

- 保存或测试模型配置前，根据经校验的 `baseUrl` 请求精确 origin 权限；拒绝或原生 prompt 异常时不保存配置、不访问 `/v1/models`，并显示可重试提示。
- 删除当前持久化会话时同步清理控制器中的会话 ID 和旧 turns；删除其他历史项不影响正在查看的会话。
- 设置 E2E 新增已有配置编辑、保存、reload 和重新进入设置后的字段持久化断言，并继续覆盖新建、测试、保存和删除 Anthropic 配置。
- SPA mock 解析真实 OpenAI request body；联合分析必须包含最新的 `4.8 吉瓦时` 和 `六小时`，且不得包含旧值 `2.1 吉瓦时`，否则返回 422。E2E 同时直接断言记录到的请求体。
- 普通 E2E 截图改写入忽略跟踪的 `test-results/playwright/store-assets`；回归前后 tracked 商店素材 SHA256 一致。只有显式运行 `pnpm store-assets:generate` 才更新 `store-assets`，仍需人工复核后提交。

最终串联验证退出码 0：TypeScript 和 ESLint 通过；Vitest 17 files、107/107 tests 通过，statements 79.97%、branches 78.46%、functions 83.13%、lines 79.97%；WXT production build 通过；Playwright 4/4 通过。生产 manifest 权限集合保持不变，构建产物安全扫描仍无动态执行、远程 JavaScript、测试凭证或 source map。
