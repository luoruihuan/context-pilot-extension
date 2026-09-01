import { BarChart3, FileSearch, ListChecks, Rows3 } from "lucide-react";
import type { ChatTurn, TabReference } from "@/shared/types/domain";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import type { ChatStatus, ChatUsage, SourceError } from "./chat-reducer";
import styles from "./chat.module.css";

const actions = [
  { label: "总结页面", icon: Rows3 },
  { label: "提取要点", icon: ListChecks },
  { label: "查找信息", icon: FileSearch },
  { label: "比较与分析", icon: BarChart3 },
];

interface ChatViewProps {
  turns: ChatTurn[];
  tabs: TabReference[];
  selectedTabs: TabReference[];
  onTabsChange(tabs: TabReference[]): void;
  onSubmit(message: string, tabIds: number[]): void;
  onRequestTabsPermission?(): Promise<boolean>;
  onRequestTabAccess?(tab: TabReference): Promise<boolean>;
  configured: boolean;
  onOpenSettings(): void;
  streaming?: boolean;
  errorMessage?: string;
  sourceErrors?: SourceError[];
  usage?: ChatUsage;
  onStop?(): void;
  readingTabs?: number[];
  status?: ChatStatus;
}

export function ChatView(props: ChatViewProps) {
  const selectedTabs = props.selectedTabs.map((tab) => {
    const error = props.sourceErrors?.find((item) => item.tabId === tab.tabId);
    if (error?.code === "PERMISSION_REQUIRED") return { ...tab, permission: "required" as const };
    if (error?.code === "RESTRICTED_PAGE") return { ...tab, permission: "restricted" as const };
    return tab;
  });

  return (
    <section className={styles.chatView} aria-label="AI 对话">
      <div className={styles.scrollRegion}>
        {props.errorMessage && (
          <div className={styles.chatError} role="alert">{props.errorMessage}</div>
        )}
        {props.sourceErrors && props.sourceErrors.length > 0 && (
          <div className={styles.sourceWarning} role="status">
            {props.sourceErrors.map((error) => error.sourceId).join("、")} 读取失败，已继续分析其他页面。
          </div>
        )}
        {props.readingTabs && props.readingTabs.length > 0 && (
          <div className={styles.readingStatus} role="status" aria-live="polite">
            读取中：{props.readingTabs.map((tabId) =>
              selectedTabs.find((tab) => tab.tabId === tabId)?.title ?? `页签 ${tabId}`
            ).join("、")}
          </div>
        )}
        {props.status === "stopped" && !props.turns.some((turn) => turn.role === "assistant") && (
          <div className={styles.readingStatus} role="status" aria-live="polite">
            已停止读取
          </div>
        )}
        {props.turns.length > 0 ? (
          <MessageList turns={props.turns} />
        ) : (
          <div className={styles.welcome}>
            <div className={styles.wordmark}>CP</div>
            <h2>从正在浏览的内容开始</h2>
            <p>引用一个或多个页签，整理信息、比较观点或分析表格。</p>
            <div className={styles.quickActions}>
              {actions.map(({ label, icon: Icon }) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => props.onSubmit(label, props.selectedTabs.map((tab) => tab.tabId))}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
            {!props.configured && (
              <button className={styles.setupButton} type="button" onClick={props.onOpenSettings}>
                配置模型 API
              </button>
            )}
          </div>
        )}
        {props.usage && (props.usage.inputTokens !== undefined || props.usage.outputTokens !== undefined) && (
          <p className={styles.usage}>
            用量：输入 {props.usage.inputTokens ?? "-"} · 输出 {props.usage.outputTokens ?? "-"}
          </p>
        )}
      </div>
      <Composer
        tabs={props.tabs}
        selectedTabs={selectedTabs}
        onTabsChange={props.onTabsChange}
        onSubmit={props.onSubmit}
        onRequestTabsPermission={props.onRequestTabsPermission}
        onRequestTabAccess={props.onRequestTabAccess}
        disabled={!props.configured}
        streaming={props.streaming}
        onStop={props.onStop}
        stopLabel={props.readingTabs && props.readingTabs.length > 0 ? "停止读取" : "停止生成"}
      />
    </section>
  );
}
