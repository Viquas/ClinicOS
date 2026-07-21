import { cn } from "@/lib/utils";

/**
 * Loading placeholders (§8.2 — the app targets tier-3 connectivity, so a
 * DB round-trip on navigation is routine, not exceptional). A skeleton that
 * mirrors the incoming layout keeps the screen from jumping when data lands
 * and reads as "loading" rather than "empty" — the distinction a nurse needs
 * at 9am when a screen legitimately has nothing in it yet.
 *
 * `bg-surface-sunken` rather than a grey: it's the same recessed tone the app
 * already uses for wells, so skeletons inherit light/dark for free and never
 * flash a colour that isn't in the system.
 */
export function Skeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[var(--radius-control)] bg-surface-sunken",
        className,
      )}
      aria-hidden="true"
    />
  );
}

/** A card-shaped skeleton — the most common board unit. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] bg-surface p-4 shadow-soft",
        className,
      )}
      aria-hidden="true"
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}

/**
 * A full screen's worth of placeholder: a title bar and a stack of cards.
 * The default for a `loading.tsx` when a screen has no distinctive shape
 * worth mirroring more precisely.
 */
export function SkeletonScreen({ rows = 4 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex flex-col gap-3"
    >
      <div className="mb-2 space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
