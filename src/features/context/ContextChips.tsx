import { Globe2, X } from "lucide-react";
import type { TabReference } from "@/shared/types/domain";
import { StatusBadge } from "@/shared/components/StatusBadge";
import styles from "./context.module.css";

export function ContextChips({
  tabs,
  onRemove,
}: {
  tabs: TabReference[];
  onRemove(tabId: number): void;
}) {
  return (
    <div className={styles.chips} aria-label="本轮引用页签">
      {tabs.map((tab) => (
        <span className={styles.chip} key={tab.tabId}>
          <Globe2 size={13} aria-hidden="true" />
          <span className={styles.chipTitle}>{tab.title}</span>
          {tab.permission === "required" && (
            <StatusBadge tone="warning">需授权</StatusBadge>
          )}
          {tab.permission === "restricted" && (
            <StatusBadge tone="danger">不可读取</StatusBadge>
          )}
          <button
            type="button"
            aria-label={`移除 ${tab.title}`}
            onClick={() => onRemove(tab.tabId)}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}
