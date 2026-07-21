"use client";

import { cn } from "@/lib/utils";
import { useRef } from "react";

/**
 * iOS segmented control. Used for parallel doctor queues and for switching
 * between today/month on the dashboard — never for more than four options,
 * which is where the labels stop fitting in Kannada (§8.5).
 *
 * Implements the ARIA tablist keyboard contract: a roving tabindex (only the
 * selected tab is in the Tab order) and Arrow/Home/End to move between tabs.
 * Without it, a keyboard user lands on the tablist and can only reach the
 * active tab — the others are unreachable, which for a nurse on a tablet with
 * a paired keyboard means half the screen's views simply don't exist.
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
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, delta: number) => {
    const next = (from + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      move(index, 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      move(index, -1);
    } else if (e.key === "Home") {
      e.preventDefault();
      move(0, 0);
    } else if (e.key === "End") {
      e.preventDefault();
      move(options.length - 1, 0);
    }
  };

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
      {options.map((option, index) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              "flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-pill)] px-3",
              "text-[15px] font-semibold tracking-[-0.01em]",
              "transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
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
