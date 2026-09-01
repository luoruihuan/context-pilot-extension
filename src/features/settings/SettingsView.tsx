import { ArrowLeft } from "lucide-react";
import type { ModelProfile } from "@/shared/types/domain";
import { IconButton } from "@/shared/components/IconButton";
import { ModelProfileForm } from "./ModelProfileForm";
import styles from "./settings.module.css";

export function SettingsView({
  profile,
  onBack,
  onSave,
  onTest,
}: {
  profile?: ModelProfile;
  onBack(): void;
  onSave(profile: ModelProfile): void | Promise<void>;
  onTest(profile: ModelProfile): void | Promise<void>;
}) {
  return (
    <section className={styles.settings}>
      <header>
        <IconButton label="返回对话" onClick={onBack}><ArrowLeft size={18} /></IconButton>
        <div><h2>模型设置</h2><p>连接兼容的 OpenAI 或 Anthropic API</p></div>
      </header>
      <ModelProfileForm initialProfile={profile} onSave={onSave} onTest={onTest} />
    </section>
  );
}
