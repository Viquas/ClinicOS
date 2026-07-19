"use client";

import { cn } from "@/lib/utils";

/**
 * iOS segmented control. Used for parallel doctor queues and for switching
 * between today/month on the dashboard — never for more than four options,
 * which is where the labels stop fitting in Kannada (§8.5).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string; badge?: number }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex gap-1 rounded-[var(--radius-pill)] p-1",
        /* Sunken token, not a black overlay — the canvas is tinted now, and a
           neutral overlay on a blue-gray field reads as muddy rather than
           recessed. */
        "bg-surface-sunken",
        className,
      )}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-pill)] px-3",
              "text-[15px] font-semibold tracking-[-0.01em]",
              "transition-colors duration-150",
              isActive
                ? "bg-surface text-ink shadow-[0_2px_8px_-2px_rgba(15,40,60,0.18)]"
                : "text-ink-secondary",
            )}
          >
            {option.label}
            {typeof option.badge === "number" ? (
              <span className="tabular text-[13px] font-bold opacity-60">
                {option.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
