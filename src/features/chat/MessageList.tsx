import { Bot, UserRound } from "lucide-react";
import type { ChatTurn } from "@/shared/types/domain";
import { StatusBadge } from "@/shared/components/StatusBadge";
import styles from "./chat.module.css";

export function MessageList({ turns }: { turns: ChatTurn[] }) {
  return (
    <div className={styles.messages} aria-live="polite">
      {turns.map((turn) => (
        <article className={styles.message} key={turn.id}>
          <div className={styles.avatar}>
            {turn.role === "assistant" ? <Bot size={16} /> : <UserRound size={16} />}
          </div>
          <div className={styles.messageBody}>
            <div className={styles.messageMeta}>
              <strong>{turn.role === "assistant" ? "Context Pilot" : "你"}</strong>
              {turn.status === "streaming" && <StatusBadge tone="busy">生成中</StatusBadge>}
              {turn.status === "error" && <StatusBadge tone="danger">失败</StatusBadge>}
              {turn.status === "stopped" && <StatusBadge tone="warning">已停止</StatusBadge>}
            </div>
            <p>{turn.content}</p>
            {turn.sources.length > 0 && (
              <div className={styles.sources}>
                {turn.sources.map((source) => (
                  <a href={source.url} key={source.sourceId} target="_blank" rel="noreferrer">
                    {source.sourceId} · {source.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
