import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import type { ModelProfile } from "@/shared/types/domain";
import type { ThemePreference } from "@/services/storage";
import { IconButton } from "@/shared/components/IconButton";
import { ModelProfileForm } from "./ModelProfileForm";
import styles from "./settings.module.css";

export function SettingsView({
  profile,
  profiles = profile ? [profile] : [],
  onBack,
  onSave,
  onTest,
  onSelect,
  onCreate,
  onDelete,
  theme = "system",
  onThemeChange,
}: {
  profile?: ModelProfile;
  profiles?: ModelProfile[];
  onBack(): void;
  onSave(profile: ModelProfile): void | Promise<void>;
  onTest(profile: ModelProfile): void | Promise<void>;
  onSelect?(id: string): void;
  onCreate?(): void;
  onDelete?(id: string): void | Promise<void>;
  theme?: ThemePreference;
  onThemeChange?(theme: ThemePreference): void | Promise<void>;
}) {
  return (
    <section className={styles.settings}>
      <header>
        <IconButton label="返回对话" onClick={onBack}><ArrowLeft size={18} /></IconButton>
        <div><h2>模型设置</h2><p>连接兼容的 OpenAI 或 Anthropic API</p></div>
      </header>
      <div className={styles.preferenceManager}>
        <div className={styles.field}>
          <label htmlFor="theme-preference">主题</label>
          <select id="theme-preference" value={theme} onChange={(event) => void onThemeChange?.(event.target.value as ThemePreference)}>
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>
      </div>
      <div className={styles.profileManager}>
        <div className={styles.profileToolbar}>
          <strong>模型配置</strong>
          <button type="button" className={styles.secondaryButton} onClick={onCreate}>
            <Plus size={15} />新建配置
          </button>
        </div>
        <div className={styles.profileList} role="listbox" aria-label="模型配置列表">
          {profiles.map((item) => (
            <button
              type="button"
              role="option"
              aria-selected={item.id === profile?.id}
              key={item.id}
              onClick={() => onSelect?.(item.id)}
            >
              <span>{item.name}</span>
              <small>{item.model}</small>
            </button>
          ))}
        </div>
        {profile && (
          <button type="button" className={styles.deleteButton} onClick={() => void onDelete?.(profile.id)}>
            <Trash2 size={15} />删除配置
          </button>
        )}
      </div>
      <ModelProfileForm key={profile?.id ?? "new"} initialProfile={profile} onSave={onSave} onTest={onTest} />
    </section>
  );
}
