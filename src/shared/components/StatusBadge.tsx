import styles from "./shared.module.css";

type Tone = "neutral" | "success" | "warning" | "danger" | "busy";

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: Tone;
}) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
