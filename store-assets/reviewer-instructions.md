# Chrome Web Store 审核说明

## 安装

1. 解压提交包，确认根目录包含 `manifest.json`。
2. 在 `chrome://extensions` 开启开发者模式并“加载已解压的扩展程序”。
3. 打开普通 HTTP/HTTPS 文章页面，点击工具栏中的 Context Pilot 图标打开 Side Panel。

## 模型配置与凭证

扩展没有开发者中转服务，审核需要一个可访问的 OpenAI Chat Completions-compatible 或 Anthropic Messages 测试端点。发布者必须在提交备注中另行提供审核期限额凭证和 HTTPS base URL，不得把凭证写进扩展包或本文档。

本地开发也可运行仓库 Playwright mock server；它覆盖 OpenAI `/v1/models`、`/v1/chat/completions` SSE 以及 Anthropic `/v1/models`、`/v1/messages` SSE。`e2e-local-key` 仅用于本机确定性测试，不是真实密钥。

## 审核步骤

1. 点击“设置”→“新建配置”，选择协议并填写审核端点、API Key 与模型名称。
2. 点击“测试连接”，确认显示“连接正常”，再“保存模型”。
3. 返回普通文章页，在侧栏输入问题并发送，确认出现流式回答、来源与 token 用量。
4. 输入 `@` 或点击引用图标；首次会请求可选 `tabs` 权限。拒绝时扩展应显示重试授权提示，不读取其他页签；允许后选择第二个页签。
5. 第二页签来自新 origin 时会请求该 origin 的可选 host permission。拒绝时显示“需授权”，允许后才读取。
6. 修改 SPA 页面内容后再次提问，确认使用新内容；关闭一个已选页签，确认显示单页失败提示且继续分析其余页面。
7. 生成过程中点击停止按钮，确认已生成文字仍保留并标记“已停止”。
8. 打开“对话历史”恢复刚才会话；在“模型设置”验证配置的创建、编辑与删除。

## 权限逐项用途

- `activeTab`：用户点击扩展后读取当前活动页面，仅用于本次明确操作。
- `scripting`：在获准的选中页签中执行本地打包的提取脚本；不注入远程代码。
- `sidePanel`：承载对话、页签选择、历史和设置界面。
- `storage`：本地保存模型配置、API Key与偏好；网页正文不写入存储。
- 可选 `tabs`：仅在用户打开 `@` 选择器时列出当前窗口页签标题和 URL；拒绝后可继续只用当前页并可重试。
- 可选 `https://*/*`、`http://localhost/*`、`http://127.0.0.1/*` host permission：按用户选择的页面 origin 和用户保存的模型 origin 分组请求，用于页面提取及直接模型请求。

扩展不请求 cookies、history、webRequest 或通配符必选 host permission。Chrome 内置页面、Chrome Web Store 等受限页面不会被读取。
