import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle, PlugZap } from "lucide-react";
import type { ModelProfile, ProviderKind } from "@/shared/types/domain";
import styles from "./settings.module.css";

type ProfileDraft = Omit<ModelProfile, "id" | "createdAt" | "updatedAt"> &
  Partial<Pick<ModelProfile, "id" | "createdAt" | "updatedAt">>;

const now = () => Date.now();

export function ModelProfileForm({
  initialProfile,
  onSave,
  onTest,
}: {
  initialProfile?: ModelProfile;
  onSave(profile: ModelProfile): void | Promise<void>;
  onTest(profile: ModelProfile): void | Promise<void>;
}) {
  const [provider, setProvider] = useState<ProviderKind>(
    initialProfile?.provider ?? "openai-chat",
  );
  const [name, setName] = useState(initialProfile?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(initialProfile?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(initialProfile?.apiKey ?? "");
  const [model, setModel] = useState(initialProfile?.model ?? "");
  const [maxOutputTokens, setMaxOutputTokens] = useState(String(initialProfile?.maxOutputTokens ?? 4096));
  const [temperature, setTemperature] = useState(String(initialProfile?.temperature ?? 0.3));
  const [testing, setTesting] = useState(false);
  const [testPassed, setTestPassed] = useState(false);
  const [testError, setTestError] = useState("");
  const [saveError, setSaveError] = useState("");
  const profile = useMemo<ModelProfile>(() => {
    const timestamp = now();
    return {
      id: initialProfile?.id ?? crypto.randomUUID(),
      name,
      provider,
      baseUrl,
      apiKey,
      model,
      maxOutputTokens: Number(maxOutputTokens),
      ...(temperature.trim() === "" ? {} : { temperature: Number(temperature) }),
      isDefault: initialProfile?.isDefault ?? true,
      createdAt: initialProfile?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
  }, [apiKey, baseUrl, initialProfile, maxOutputTokens, model, name, provider, temperature]);

  function generationError(): string | undefined {
    if (!Number.isInteger(profile.maxOutputTokens) || profile.maxOutputTokens < 1 || profile.maxOutputTokens > 200_000) {
      return "最大输出 Token 必须是 1 到 200000 之间的整数。";
    }
    if (profile.temperature !== undefined && (!Number.isFinite(profile.temperature) || profile.temperature < 0 || profile.temperature > 2)) {
      return "温度必须是 0 到 2 之间的数值。";
    }
    return undefined;
  }

  async function testConnection() {
    setTesting(true);
    setTestPassed(false);
    setTestError("");
    setSaveError("");
    const validationError = generationError();
    if (validationError) {
      setTestError(validationError);
      setTesting(false);
      return;
    }
    try {
      await onTest(profile);
      setTestPassed(true);
    } catch (caught) {
      setTestError(caught instanceof Error ? caught.message : "连接测试失败。请检查配置后重试。");
    } finally {
      setTesting(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setSaveError("");
    setTestError("");
    const validationError = generationError();
    if (validationError) {
      setSaveError(validationError);
      return;
    }
    void Promise.resolve(onSave(profile)).catch((caught: unknown) => {
      setSaveError(caught instanceof Error ? caught.message : "保存失败，请重试。");
    });
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.field}>
        <label htmlFor="profile-name">配置名称</label>
        <input id="profile-name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：工作模型" />
      </div>
      <div className={styles.field}>
        <label htmlFor="profile-provider">API 协议</label>
        <select id="profile-provider" value={provider} onChange={(event) => setProvider(event.target.value as ProviderKind)}>
          <option value="openai-chat">OpenAI Chat Completions</option>
          <option value="anthropic-messages">Anthropic Messages</option>
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="profile-url">API 地址</label>
        <input id="profile-url" required type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={provider === "openai-chat" ? "https://api.example.com/v1" : "https://api.anthropic.com"} />
      </div>
      <div className={styles.field}>
        <label htmlFor="profile-key">API Key</label>
        <input id="profile-key" required type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
      </div>
      <div className={styles.field}>
        <label htmlFor="profile-model">模型名称</label>
        <input id="profile-model" required value={model} onChange={(event) => setModel(event.target.value)} placeholder="服务商支持的模型 ID" />
      </div>
      <div className={styles.advancedFields}>
        <div className={styles.field}>
          <label htmlFor="profile-max-output">最大输出 Token</label>
          <input id="profile-max-output" required inputMode="numeric" type="number" value={maxOutputTokens} onChange={(event) => setMaxOutputTokens(event.target.value)} />
        </div>
        <div className={styles.field}>
          <label htmlFor="profile-temperature">温度</label>
          <input id="profile-temperature" inputMode="decimal" step="0.1" type="number" value={temperature} onChange={(event) => setTemperature(event.target.value)} />
        </div>
      </div>
      <p className={styles.disclosure}>网页内容和问题会直接发送到你配置的 AI 服务商，开发者不会接收这些数据。</p>
      {testError && <p className={styles.formError} role="alert">{testError}</p>}
      {saveError && <p className={styles.formError} role="alert">{saveError}</p>}
      <div className={styles.actions}>
        <button className={styles.secondaryButton} type="button" disabled={testing} onClick={() => void testConnection()}>
          {testing ? <LoaderCircle className={styles.spin} size={15} /> : testPassed ? <CheckCircle2 size={15} /> : <PlugZap size={15} />}
          {testing ? "连接中" : testPassed ? "连接正常" : "测试连接"}
        </button>
        <button className={styles.primaryButton} type="submit">保存模型</button>
      </div>
    </form>
  );
}

export type { ProfileDraft };
