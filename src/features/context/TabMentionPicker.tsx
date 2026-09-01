import { useEffect, useMemo, useRef, useState } from "react";
import { FileWarning, Globe2, LockKeyhole } from "lucide-react";
import type { TabReference } from "@/shared/types/domain";
import { StatusBadge } from "@/shared/components/StatusBadge";
import styles from "./context.module.css";

interface TabMentionPickerProps {
  tabs: TabReference[];
  selectedTabs: TabReference[];
  onSelect(tab: TabReference): void;
  onClose(): void;
}

export function TabMentionPicker({
  tabs,
  selectedTabs,
  onSelect,
  onClose,
}: TabMentionPickerProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
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

  function choose(index: number) {
    const tab = results[index];
    if (
      tab &&
      !selectedIds.has(tab.tabId) &&
      selectedTabs.length < 10 &&
      tab.permission !== "restricted"
    ) {
      onSelect(tab);
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
            choose(activeIndex);
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
              data-active={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
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
                <small>{new URL(tab.url).hostname}</small>
              </span>
              {tab.isCurrent && <StatusBadge tone="busy">当前</StatusBadge>}
              {selected && <StatusBadge>已添加</StatusBadge>}
              {tab.permission === "required" && (
                <StatusBadge tone="warning">需授权</StatusBadge>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
