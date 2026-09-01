import { ArrowLeft, MessageSquareText, Trash2 } from "lucide-react";
import { IconButton } from "@/shared/components/IconButton";
import styles from "./history.module.css";

export interface HistoryItem {
  id: string;
  title: string;
  updatedAt: number;
  turnCount: number;
}

export function HistoryView({ items, onBack, onOpen, onDelete }: { items: HistoryItem[]; onBack(): void; onOpen(id: string): void; onDelete(id: string): void }) {
  return (
    <section className={styles.history}>
      <header><IconButton label="返回对话" onClick={onBack}><ArrowLeft size={18} /></IconButton><h2>对话历史</h2></header>
      {items.length === 0 ? (
        <div className={styles.empty}><MessageSquareText size={28} /><strong>还没有对话</strong><span>完成一次提问后，会话会保存在本地。</span></div>
      ) : (
        <ul>{items.map((item) => <li key={item.id}><button type="button" onClick={() => onOpen(item.id)}><strong>{item.title}</strong><span>{item.turnCount} 条消息</span></button><IconButton label={`删除 ${item.title}`} onClick={() => onDelete(item.id)}><Trash2 size={15} /></IconButton></li>)}</ul>
      )}
    </section>
  );
}
