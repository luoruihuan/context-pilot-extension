# Task 5/6 审查修复报告

## 范围

- 修复 `@` 页签选择时的可选 `tabs` 权限和所选 origin 权限请求链路。
- 补齐权限拒绝、受限页、读取中、停止读取和连接测试失败的可见 UI。
- 将单 profile 状态扩展为兼容旧调用的 profile 列表，支持选择、新建、编辑、删除。
- 将 activeTab 注入权限类失败归一为 `PERMISSION_REQUIRED`，避免误报 `BROWSER_ERROR`。

## TDD 证据

先新增 focused tests 并确认 RED，失败覆盖：

- 选择 required 页签没有调用 tabs/origin 权限请求。
- 权限拒绝后仍误添加页签且无重试反馈。
- restricted/reading 状态缺少可访问 UI 和停止操作。
- 连接测试 reject 未转为 `role=alert`。
- Settings 缺少 profile 列表 CRUD。
- activeTab 注入失败返回 `BROWSER_ERROR`。

随后以最小实现逐项转 GREEN，并补充已授权 tabs 不重复弹窗、受限 URL 缺失等边界测试。

## 验证结果

- focused：相关浏览器/UI测试全部通过（31 tests）。
- 全量：`pnpm test`，17 个测试文件、98 tests 全部通过。
- 类型：`pnpm typecheck` 通过。
- 代码质量：`pnpm lint` 通过。
- 构建：`pnpm build` 通过，Manifest 权限仍为 activeTab/scripting/sidePanel/storage，optional tabs 与限定 host permissions。

## 关注点

- 连接测试错误文案沿用底层异常消息；未泄露 API Key。
- UI 的读取中页签由 chat extracting 状态映射，实际提取仍由现有 ChatController 管理。
- profile 删除后自动选择 default 或首个剩余 profile；删除最后一个 profile 后保持未配置状态。

## Scoped Re-review P1 补修

提取阶段点击停止时，`ChatController` 会进入 `stopped`，此时只有 user turn、尚未创建 assistant turn，原 UI 因而没有可见终态。新增 focused 测试先确认 `ChatView` 在 `status="stopped"`、无 assistant turn 时缺少可访问提示（RED），再通过透传 `chat.status` 并渲染 `role="status"` 的“已停止读取”终态提示修复（GREEN）。

本次复验：全量 17 个测试文件、99 tests 通过；`pnpm typecheck`、`pnpm lint`、`pnpm build` 均通过。
