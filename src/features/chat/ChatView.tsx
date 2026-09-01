import { BarChart3, FileSearch, ListChecks, Rows3 } from "lucide-react";
import type { ChatTurn, TabReference } from "@/shared/types/domain";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
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
  onSubmit(message: string): void;
  configured: boolean;
  onOpenSettings(): void;
}

export function ChatView(props: ChatViewProps) {
  return (
    <section className={styles.chatView} aria-label="AI 对话">
      <div className={styles.scrollRegion}>
        {props.turns.length > 0 ? (
          <MessageList turns={props.turns} />
        ) : (
          <div className={styles.welcome}>
            <div className={styles.wordmark}>CP</div>
            <h2>从正在浏览的内容开始</h2>
            <p>引用一个或多个页签，整理信息、比较观点或分析表格。</p>
            <div className={styles.quickActions}>
              {actions.map(({ label, icon: Icon }) => (
                <button type="button" key={label} onClick={() => props.onSubmit(label)}>
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
      </div>
      <Composer
        tabs={props.tabs}
        selectedTabs={props.selectedTabs}
        onTabsChange={props.onTabsChange}
        onSubmit={props.onSubmit}
        disabled={!props.configured}
      />
    </section>
  );
}
