import type { ReactNode } from "react";

/**
 * Large-title screen header (§8.2). Sits above the content rather than in a
 * chrome bar, so the title scrolls away and the data gets the screen.
 */
export function ScreenHeader({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <header className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.025em] text-ink">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 text-[15px] text-ink-secondary">{subtitle}</p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0 pb-1">{trailing}</div> : null}
    </header>
  );
}
