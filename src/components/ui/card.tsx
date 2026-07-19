import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * The base material: a white card floating on the cool blue-gray canvas,
 * lifted by a wide low-opacity shadow rather than a border. Hierarchy comes
 * from layering and spacing — a hairline here would flatten the stack.
 */
export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("rounded-[var(--radius-card)] bg-surface shadow-soft", className)}
    >
      {children}
    </section>
  );
}

/**
 * Section label above a grouped card — the iOS inset-list convention.
 * Uppercase and small, so it recedes behind the data it introduces.
 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-4 pb-2 text-[13px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
      {children}
    </h2>
  );
}

/**
 * Grouped inset list. Separators are inset from the left to align with the
 * row's text rather than the card edge — the detail that makes a list read as
 * iOS-native rather than as a generic table.
 */
export function GroupedList({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="divide-y divide-hairline [&>*]:first:rounded-t-[var(--radius-card)]">
        {children}
      </div>
    </Card>
  );
}

export function Row({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
  className,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Element = onClick ? "button" : "div";

  return (
    <Element
      onClick={onClick}
      className={cn(
        "flex w-full min-h-[var(--touch-min)] items-center gap-3 px-4 py-3 text-left",
        onClick &&
          "transition-colors duration-100 active:bg-black/[0.04] dark:active:bg-white/[0.06]",
        className,
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-medium text-ink">{title}</div>
        {subtitle ? (
          <div className="truncate text-[14px] text-ink-secondary">
            {subtitle}
          </div>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </Element>
  );
}
