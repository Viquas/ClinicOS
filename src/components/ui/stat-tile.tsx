import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Gradient stat tile — the reference's signature surface.
 *
 * Reserved for aggregate numbers (visits, revenue, stock counts). Individual
 * clinical readings deliberately do NOT use it: a gradient behind a fever
 * value costs contrast exactly where contrast matters most.
 */
export function StatTile({
  label,
  value,
  unit,
  delta,
  tint = "sky",
  icon,
  footer,
}: {
  label: string;
  value: string | number;
  unit?: string;
  /** e.g. "+12% vs last month". Sign drives the colour. */
  delta?: string;
  tint?: "sky" | "mint" | "plain";
  icon?: ReactNode;
  footer?: ReactNode;
}) {
  const isPositive = delta?.trim().startsWith("+");

  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] p-5",
        tint === "sky" && "bg-tint-sky",
        tint === "mint" && "bg-tint-mint",
        tint === "plain" && "bg-surface shadow-soft",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[14px] font-semibold text-ink-secondary">
          {label}
        </span>
        {icon ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface/70 text-ink-secondary">
            {icon}
          </span>
        ) : null}
      </div>

      <div className="mt-2.5 flex items-baseline gap-1.5">
        <span className="tabular text-[34px] font-extrabold leading-none tracking-[-0.025em] text-ink">
          {value}
        </span>
        {unit ? (
          <span className="text-[15px] font-semibold text-ink-secondary">
            {unit}
          </span>
        ) : null}
      </div>

      {delta ? (
        <div
          className={cn(
            "mt-2 text-[13px] font-semibold",
            /*
             * Green/red here read as trend direction, not clinical state.
             * They only ever appear on aggregate tiles, never beside a vital,
             * which is what keeps red unambiguous elsewhere.
             */
            isPositive ? "text-success" : "text-alert",
          )}
        >
          {delta}
        </div>
      ) : null}

      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}

/**
 * Large tinted panel for section intros and hero areas — the reference's
 * "Your Entire Practice at a Glance" band.
 */
export function GradientPanel({
  tint = "sky",
  className,
  children,
}: {
  tint?: "sky" | "mint" | "hero";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[28px] p-6 sm:p-8",
        tint === "sky" && "bg-tint-sky",
        tint === "mint" && "bg-tint-mint",
        tint === "hero" && "bg-tint-hero",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Bar sparkline built from divs — no chart library, so it stays cheap on a
 * low-end tablet and inherits theme colours for free.
 */
export function MiniBars({
  values,
  tone = "accent",
}: {
  values: number[];
  tone?: "accent" | "alert";
}) {
  const max = Math.max(...values, 1);

  return (
    <div
      className="flex h-12 items-end gap-[3px]"
      role="img"
      aria-label={`Trend across ${values.length} points`}
    >
      {values.map((v, i) => (
        <div
          key={i}
          style={{ height: `${Math.max((v / max) * 100, 8)}%` }}
          className={cn(
            /*
             * rounded-t only. A fully-rounded bar shorter than it is wide
             * renders as a lozenge and stops reading as a bar at all.
             */
            "flex-1 rounded-t-[4px]",
            tone === "accent" ? "bg-accent/75" : "bg-alert/75",
          )}
        />
      ))}
    </div>
  );
}
