"use client";

import { cn } from "@/lib/utils";
import { useId } from "react";

/**
 * Vitals capture — the component carrying the most clinical-safety weight
 * (§8.3 rules 2, 3, 4).
 *
 * Three rules are structural here, not stylistic:
 *
 *  1. The prior value renders under every field, always. It is the single
 *     cheapest defence against a transposed digit.
 *  2. Out-of-range restyles the card; it never blocks the save. Clinical
 *     reality beats form validation — a real 41°C must be recordable.
 *  3. Skipping is an explicit act with its own control. A blank field is
 *     never silently accepted as "not measured".
 */
export function VitalsInput({
  label,
  unit,
  value,
  onChange,
  priorValue,
  isSkipped = false,
  onToggleSkip,
  /** Human-readable reason the value is out of range, e.g. "Above 38.0°C". */
  outOfRangeNote,
  inputMode = "decimal",
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  priorValue?: string;
  isSkipped?: boolean;
  onToggleSkip?: () => void;
  outOfRangeNote?: string;
  inputMode?: "decimal" | "numeric";
}) {
  const id = useId();
  const isAbnormal = Boolean(outOfRangeNote) && !isSkipped;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] bg-surface p-4 transition-shadow duration-150",
        isAbnormal
          ? "bg-alert-surface ring-1 ring-inset ring-alert/40"
          : "shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        isSkipped && "opacity-55",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className={cn(
            "text-[13px] font-semibold uppercase tracking-[0.04em]",
            isAbnormal ? "text-alert" : "text-ink-secondary",
          )}
        >
          {label}
        </label>

        {onToggleSkip ? (
          <button
            type="button"
            onClick={onToggleSkip}
            className="min-h-[32px] text-[14px] font-medium text-accent active:opacity-60"
          >
            {isSkipped ? "Measure" : "Skip"}
          </button>
        ) : null}
      </div>

      {isSkipped ? (
        <p className="mt-2 text-[17px] font-medium text-ink-secondary">
          Skipped — not measured
        </p>
      ) : (
        <div className="mt-1 flex items-baseline gap-2">
          <input
            id={id}
            type="text"
            inputMode={inputMode}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="—"
            aria-invalid={isAbnormal}
            aria-describedby={isAbnormal ? `${id}-note` : undefined}
            className={cn(
              "tabular w-full min-w-0 bg-transparent p-0",
              "text-[40px] font-extrabold leading-[1.1] tracking-[-0.02em]",
              "outline-none placeholder:text-ink-secondary/40",
              isAbnormal ? "text-alert" : "text-ink",
            )}
          />
          <span
            className={cn(
              "shrink-0 text-[15px] font-semibold",
              isAbnormal ? "text-alert" : "text-ink-secondary",
            )}
          >
            {unit}
          </span>
        </div>
      )}

      {isAbnormal ? (
        <p
          id={`${id}-note`}
          className="mt-1 text-[13px] font-semibold text-alert"
        >
          {outOfRangeNote}
        </p>
      ) : null}

      {priorValue && !isSkipped ? (
        <p className="mt-1 text-[13px] text-ink-secondary">
          Last visit: {priorValue}
        </p>
      ) : null}
    </div>
  );
}
