import { useState } from "react";
import { Copy, RotateCcw } from "lucide-react";
import type { ChatTurn } from "@/shared/types/domain";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { MarkdownContent } from "./MarkdownContent";
import styles from "./chat.module.css";

export function MessageList({
  turns,
  onRetry,
  canRetry,
}: {
  turns: ChatTurn[];
  onRetry?(turnId: string): void;
  canRetry?(turnId: string): boolean;
}) {
  const [copyFeedback, setCopyFeedback] = useState<{ turnId: string; message: string; error: boolean }>();

  async function copyAnswer(turn: ChatTurn): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(turn.content);
      setCopyFeedback({ turnId: turn.id, message: "已复制回答", error: false });
    } catch {
      setCopyFeedback({ turnId: turn.id, message: "无法复制，请检查浏览器剪贴板权限后重试。", error: true });
    }
  }

  return (
    <div className={styles.messages} aria-live="polite">
      {turns.map((turn) => (
        <article className={styles.message} data-role={turn.role} key={turn.id}>
          <div className={styles.messageBody}>
            {turn.status !== "complete" && <div className={styles.messageMeta}>
              {turn.status === "streaming" && <StatusBadge tone="busy">生成中</StatusBadge>}
              {turn.status === "error" && <StatusBadge tone="danger">失败</StatusBadge>}
              {turn.status === "stopped" && <StatusBadge tone="warning">已停止</StatusBadge>}
            </div>}
            {turn.role === "assistant" && turn.status !== "streaming" ? (
              <MarkdownContent content={turn.content} />
            ) : (
              <p>{turn.content}</p>
            )}
            {turn.role === "assistant" && turn.status !== "streaming" && (
              <div className={styles.messageActions}>
                <button type="button" aria-label={`复制回答：${turn.content || "失败消息"}`} onClick={() => void copyAnswer(turn)}>
                  <Copy size={14} />复制
                </button>
                {onRetry && (canRetry?.(turn.id) ?? true) && (
                  <button type="button" aria-label={`重试回答：${turn.content || "失败消息"}`} onClick={() => onRetry(turn.id)}>
                    <RotateCcw size={14} />重试
                  </button>
                )}
              </div>
            )}
            {copyFeedback?.turnId === turn.id && (
              <p className={copyFeedback.error ? styles.copyError : styles.copyStatus} role={copyFeedback.error ? "alert" : "status"}>
                {copyFeedback.message}
              </p>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
