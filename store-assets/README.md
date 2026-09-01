# Chrome Web Store 交付清单

本目录包含 Context Pilot 0.1.0 的上架素材。截图由 Playwright 从本地打包扩展页面和确定性 mock 数据生成，不是概念图；mock API Key 仅为本机服务标识，不对应任何真实凭证。

普通 `pnpm playwright test` 只写入忽略跟踪的 `test-results/`。需要明确更新本目录中的稳定素材时运行 `pnpm store-assets:generate`，并人工复核尺寸与内容后提交。

## 素材

- `icon-source.svg`：无文字、无渐变的品牌源图，charcoal + teal + coral 配色。
- `icon-128.png`：128×128 商店图标。
- `promo-440x280.png`：440×280 真实产品 UI 宣传图。
- `screenshots/01-current-page-answer.png`：1280×800 当前页问答。
- `screenshots/02-tab-selection.png`：1280×800 `@` 多页选择。
- `screenshots/03-joint-analysis.png`：1280×800 联合分析结果。

## 上架前必做

1. 将 `privacy-policy.zh-CN.md` 发布到自有、稳定、公开可访问的 HTTPS 地址，并将该地址填入商店后台。本仓库没有声称已存在该线上地址。
2. 在商店后台填写真实支持邮箱和支持页面；当前材料仅说明支持与删除流程，不伪造联系人。
3. 按 `reviewer-instructions.md` 提供审核期可访问的限额凭证，或与审核团队确认其环境能启动本地 mock 服务。不得提交仓库中的 `e2e-local-key` 作为真实凭证。
4. 上传前复核权限说明、隐私实践表单与构建扫描结果，并确认提交包不含 source map、测试密钥或开发依赖。
