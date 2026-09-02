import { useEffect, useMemo, useRef, useState } from "react";
import { FileWarning, Globe2, LockKeyhole } from "lucide-react";
import type { TabReference } from "@/shared/types/domain";
import { StatusBadge } from "@/shared/components/StatusBadge";
import styles from "./context.module.css";

interface TabMentionPickerProps {
  tabs: TabReference[];
  selectedTabs: TabReference[];
  onSelect(tab: TabReference): void;
  onRequestTabAccess?(tab: TabReference): Promise<boolean>;
  onClose(): void;
}

export function TabMentionPicker({
  tabs,
  selectedTabs,
  onSelect,
  onRequestTabAccess,
  onClose,
}: TabMentionPickerProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [accessError, setAccessError] = useState("");
  const [requestingTabId, setRequestingTabId] = useState<number>();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedIds = useMemo(
    () => new Set(selectedTabs.map((tab) => tab.tabId)),
    [selectedTabs],
  );
  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return [...tabs]
      .sort((left, right) => Number(right.isCurrent) - Number(left.isCurrent))
      .filter(
        (tab) =>
          !needle ||
          tab.title.toLocaleLowerCase().includes(needle) ||
          tab.origin.toLocaleLowerCase().includes(needle),
      );
  }, [query, tabs]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && !inputRef.current?.closest("[role=dialog]")?.contains(event.target)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [onClose]);

  async function choose(index: number) {
    const tab = results[index];
    if (
      tab &&
      !selectedIds.has(tab.tabId) &&
      selectedTabs.length < 10 &&
      tab.permission !== "restricted"
    ) {
      if (tab.permission === "required" && onRequestTabAccess) {
        setAccessError("");
        setRequestingTabId(tab.tabId);
        try {
          if (!(await onRequestTabAccess(tab))) {
            setAccessError(`“${tab.title}”需要授权。请选择该页签重试。`);
            return;
          }
        } catch {
          setAccessError(`无法授权“${tab.title}”。请选择该页签重试。`);
          return;
        } finally {
          setRequestingTabId(undefined);
        }
      }
      onSelect(tab.permission === "required" && onRequestTabAccess ? { ...tab, permission: "granted" } : tab);
      onClose();
    }
  }

  return (
    <div className={styles.picker} role="dialog" aria-label="选择页签">
      <input
        ref={inputRef}
        role="combobox"
        aria-label="引用已打开页签"
        aria-controls="context-tab-list"
        aria-expanded="true"
        aria-activedescendant={results[activeIndex] ? `tab-${results[activeIndex].tabId}` : undefined}
        placeholder="搜索标题或域名"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, results.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            void choose(activeIndex);
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      />
      <div className={styles.pickerMeta}>
        <span>已选 {selectedTabs.length}/10</span>
        <span>当前页优先</span>
      </div>
      {accessError && <p className={styles.pickerError} role="alert">{accessError}</p>}
      <ul id="context-tab-list" role="listbox">
        {results.map((tab, index) => {
          const selected = selectedIds.has(tab.tabId);
          const disabled =
            selected ||
            selectedTabs.length >= 10 ||
            tab.permission === "restricted";
          return (
            <li
              id={`tab-${tab.tabId}`}
              key={tab.tabId}
              role="option"
              aria-selected={selected}
              aria-disabled={disabled}
              aria-busy={requestingTabId === tab.tabId}
              data-active={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void choose(index)}
            >
              <span className={styles.favicon}>
                {tab.permission === "restricted" ? (
                  <FileWarning size={16} />
                ) : tab.permission === "required" ? (
                  <LockKeyhole size={16} />
                ) : (
                  <Globe2 size={16} />
                )}
              </span>
              <span className={styles.tabCopy}>
                <strong>{tab.title}</strong>
                <small>{tab.origin || "受限页面"}</small>
              </span>
              {tab.isCurrent && <StatusBadge tone="busy">当前</StatusBadge>}
              {selected && <StatusBadge>已添加</StatusBadge>}
              {tab.permission === "required" && (
                <StatusBadge tone="warning">
                  {requestingTabId === tab.tabId ? "授权中" : "需授权"}
                </StatusBadge>
              )}
              {tab.permission === "restricted" && (
                <StatusBadge tone="danger">不可读取</StatusBadge>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
