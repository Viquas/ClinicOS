import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * The token number, set large with tabular numerals so digits hold their
 * column as the queue advances (§8.2). This is the number a patient is
 * listening for, so it is the largest thing on any row it appears in.
 */
export function TokenBadge({
  number,
  isPriority = false,
  size = "md",
}: {
  number: number;
  isPriority?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div
      className={cn(
        "tabular flex items-center justify-center rounded-[14px] font-extrabold leading-none",
        size === "sm" && "h-11 w-11 text-[19px]",
        size === "md" && "h-14 w-14 text-[24px]",
        size === "lg" && "h-20 w-20 text-[40px]",
        /* Priority is clinical urgency, which is exactly what red is for. */
        isPriority
          ? "bg-alert-surface text-alert"
          : "bg-black/[0.05] text-ink dark:bg-white/[0.09]",
      )}
    >
      {number}
    </div>
  );
}

const PILL_TONES = {
  neutral: "bg-black/[0.05] text-ink-secondary dark:bg-white/[0.09]",
  accent: "bg-accent/10 text-accent",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  alert: "bg-alert-surface text-alert",
} as const;

/**
 * Always carries text, never colour alone (§8.5) — a colour-blind pharmacist
 * reading "Expired" must get the same information as one seeing the red.
 */
export function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof PILL_TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1",
        "text-[13px] font-semibold tracking-[-0.005em] whitespace-nowrap",
        PILL_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Token lifecycle → the pill a front-desk user reads (§7.2). */
export const TOKEN_STATE_LABEL: Record<
  string,
  { label: string; tone: keyof typeof PILL_TONES }
> = {
  waiting: { label: "Waiting", tone: "neutral" },
  vitals_done: { label: "Vitals done", tone: "accent" },
  with_doctor: { label: "With doctor", tone: "accent" },
  at_pharmacy: { label: "At pharmacy", tone: "warning" },
  billed: { label: "Billed", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};
