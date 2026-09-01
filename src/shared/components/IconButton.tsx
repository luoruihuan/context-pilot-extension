import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./shared.module.css";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

export function IconButton({
  label,
  children,
  className = "",
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={`${styles.iconButton} ${className}`}
    >
      {children}
    </button>
  );
}
