import { BarChart3, FileSearch, ListChecks, Rows3 } from "lucide-react";
import { useState } from "react";
import type { ChatTurn, TabReference } from "@/shared/types/domain";
import { ContextChips } from "@/features/context/ContextChips";
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
  disclosureAccepted?: boolean;
  onAcceptDisclosure?(): Promise<void>;
  onRetry?(turnId: string): void;
  canRetry?(turnId: string): boolean;
  persistenceWarning?: string;
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
  const [pendingSubmit, setPendingSubmit] = useState<{ message: string; tabIds: number[] }>();
  const [acceptingDisclosure, setAcceptingDisclosure] = useState(false);
  const currentTurnStoppedBeforeResponse =
    props.status === "stopped" && props.turns.at(-1)?.role === "user";
  const currentTurnFailedBeforeResponse =
    props.status === "error" && props.turns.at(-1)?.role === "user";
  const selectedTabs = props.selectedTabs.map((tab) => {
    const error = props.sourceErrors?.find((item) => item.tabId === tab.tabId);
    if (error?.code === "PERMISSION_REQUIRED") return { ...tab, permission: "required" as const };
    if (error?.code === "RESTRICTED_PAGE") return { ...tab, permission: "restricted" as const };
    return tab;
  });

  async function retryTabAccess(tab: TabReference): Promise<boolean> {
    if (!props.onRequestTabAccess) return false;
    const granted = await props.onRequestTabAccess(tab);
    if (granted) {
      props.onTabsChange(props.selectedTabs.map((item) =>
        item.tabId === tab.tabId ? { ...item, permission: "granted" as const } : item
      ));
    }
    return granted;
  }

  function submitWithDisclosure(message: string, tabIds: number[]): void {
    if (props.disclosureAccepted === false) {
      setPendingSubmit({ message, tabIds: [...tabIds] });
      return;
    }
    props.onSubmit(message, [...tabIds]);
  }

  async function acceptDisclosure(): Promise<void> {
    if (!pendingSubmit || acceptingDisclosure) return;
    setAcceptingDisclosure(true);
    try {
      await props.onAcceptDisclosure?.();
      const next = pendingSubmit;
      setPendingSubmit(undefined);
      props.onSubmit(next.message, [...next.tabIds]);
    } finally {
      setAcceptingDisclosure(false);
    }
  }

  return (
    <section className={styles.chatView} aria-label="AI 对话">
      <aside className={styles.contextPanel} aria-label="引用页签">
        <div className={styles.contextPanelHeader}>
          <span>引用页签</span>
          <span>{selectedTabs.length}/10</span>
        </div>
        <ContextChips
          tabs={selectedTabs}
          layout="vertical"
          onRemove={(tabId) => props.onTabsChange(selectedTabs.filter((tab) => tab.tabId !== tabId))}
          onRequestTabAccess={retryTabAccess}
        />
      </aside>
      <div className={styles.conversationPanel}>
      {pendingSubmit && (
        <div className={styles.disclosureBackdrop} role="presentation">
          <div className={styles.disclosureDialog} role="dialog" aria-modal="true" aria-labelledby="disclosure-title" aria-describedby="disclosure-copy">
            <h2 id="disclosure-title">发送前确认</h2>
            <p id="disclosure-copy">发送问题时，所选页签的页面内容、标题、URL 和你的问题会直接发送到你配置的 AI 服务商。Context Pilot 开发者不接收这些内容。数据处理仍受该 AI 服务商条款和隐私政策约束。</p>
            <div className={styles.disclosureActions}>
              <button type="button" onClick={() => setPendingSubmit(undefined)} disabled={acceptingDisclosure}>暂不发送</button>
              <button type="button" onClick={() => void acceptDisclosure()} disabled={acceptingDisclosure}>{acceptingDisclosure ? "确认中" : "同意并发送"}</button>
            </div>
          </div>
        </div>
      )}
      <div className={styles.scrollRegion}>
        {props.errorMessage && (
          <div className={styles.chatError} role="alert">
            <span>{props.errorMessage}</span>
            {currentTurnFailedBeforeResponse && (
              <button type="button" onClick={() => props.onRetry?.(props.turns.at(-1)!.id)} disabled={!props.onRetry}>
                重试请求
              </button>
            )}
          </div>
        )}
        {props.persistenceWarning && (
          <div className={styles.persistenceWarning} role="alert">{props.persistenceWarning}</div>
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
        {currentTurnStoppedBeforeResponse && (
          <div className={styles.readingStatus} role="status" aria-live="polite">
            <span>已停止读取</span>
            <button type="button" onClick={() => props.onRetry?.(props.turns.at(-1)!.id)} disabled={!props.onRetry}>
              重试读取
            </button>
          </div>
        )}
        {props.turns.length > 0 ? (
          <MessageList turns={props.turns} onRetry={props.onRetry} canRetry={props.canRetry} />
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
              onClick={() => submitWithDisclosure(label, props.selectedTabs.map((tab) => tab.tabId))}
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
        onSubmit={submitWithDisclosure}
        onRequestTabsPermission={props.onRequestTabsPermission}
        onRequestTabAccess={props.onRequestTabAccess}
        disabled={!props.configured}
        streaming={props.streaming}
        onStop={props.onStop}
        stopLabel={props.readingTabs && props.readingTabs.length > 0 ? "停止读取" : "停止生成"}
      />
      </div>
    </section>
  );
}
