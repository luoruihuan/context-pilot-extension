import { useState, type KeyboardEvent } from "react";
import { AtSign, Send, Square } from "lucide-react";
import type { TabReference } from "@/shared/types/domain";
import { IconButton } from "@/shared/components/IconButton";
import { ContextChips } from "@/features/context/ContextChips";
import { TabMentionPicker } from "@/features/context/TabMentionPicker";
import styles from "./chat.module.css";

interface ComposerProps {
  tabs: TabReference[];
  selectedTabs: TabReference[];
  onTabsChange(tabs: TabReference[]): void;
  onSubmit(message: string, tabIds: number[]): void;
  disabled?: boolean;
  streaming?: boolean;
  onStop?(): void;
}

export function Composer({
  tabs,
  selectedTabs,
  onTabsChange,
  onSubmit,
  disabled = false,
  streaming = false,
  onStop,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  function submit() {
    const message = value.trim();
    if (!message || disabled || streaming) return;
    onSubmit(message, selectedTabs.map((tab) => tab.tabId));
    setValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (pickerOpen && ["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) {
      return;
    }
    if (event.key === "Backspace" && value.length === 0 && selectedTabs.length > 0) {
      onTabsChange(selectedTabs.slice(0, -1));
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className={styles.composerShell}>
      {pickerOpen && (
        <TabMentionPicker
          tabs={tabs}
          selectedTabs={selectedTabs}
          onClose={() => setPickerOpen(false)}
          onSelect={(tab) => onTabsChange([...selectedTabs, tab])}
        />
      )}
      <ContextChips
        tabs={selectedTabs}
        onRemove={(tabId) =>
          onTabsChange(selectedTabs.filter((tab) => tab.tabId !== tabId))
        }
      />
      <div className={styles.composer}>
        <textarea
          aria-label="向 AI 提问"
          value={value}
          placeholder={disabled ? "先配置模型后开始提问" : "询问当前页面，输入 @ 引用更多页签"}
          disabled={disabled}
          onChange={(event) => {
            const nextValue = event.target.value;
            setValue(nextValue);
            if (nextValue.endsWith("@")) setPickerOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        <div className={styles.composerBar}>
          <IconButton
            label="引用页签"
            type="button"
            disabled={disabled}
            onClick={() => setPickerOpen((open) => !open)}
          >
            <AtSign size={17} />
          </IconButton>
          <span className={styles.modelHint}>默认模型</span>
          {streaming ? (
            <IconButton label="停止生成" type="button" onClick={onStop}>
              <Square size={15} fill="currentColor" />
            </IconButton>
          ) : (
            <IconButton
              label="发送消息"
              type="button"
              disabled={disabled || value.trim().length === 0}
              onClick={submit}
            >
              <Send size={17} />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
}
