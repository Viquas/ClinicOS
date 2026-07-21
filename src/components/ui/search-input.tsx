"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";

/**
 * One search control for every list that grows past a screenful (§8.4).
 *
 * Extracted from the patients board, which was the only list with search — the
 * inventory, message log, and register lists grow unbounded too, and a nurse
 * scrolling a shared tablet to find one drug is exactly the friction this
 * removes. Kept as a Card-framed row so it reads as the same affordance
 * wherever it appears.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <Card className={cn("flex items-center gap-3 px-4", className)}>
      <Search size={20} className="shrink-0 text-ink-secondary" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn(
          "min-h-[var(--touch-primary)] w-full bg-transparent",
          "text-[18px] font-medium text-ink outline-none",
          "placeholder:font-normal placeholder:text-ink-secondary/60",
        )}
      />
      {value ? (
        <button
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <X size={18} />
        </button>
      ) : null}
    </Card>
  );
}
