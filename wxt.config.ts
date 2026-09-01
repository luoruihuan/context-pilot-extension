import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
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
