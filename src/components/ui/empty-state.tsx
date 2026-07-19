import type { ReactNode } from "react";
import { Card } from "./card";

/**
 * Empty states carry instructional copy, not decoration (§8.4).
 *
 * Most of these screens are empty at 9am every day, so this is the first thing
 * a nurse sees each morning — it should tell them what to do next, not
 * apologise for having no data.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-[17px] font-semibold text-ink">{title}</p>
      {hint ? (
        <p className="max-w-[36ch] text-[15px] leading-snug text-ink-secondary">
          {hint}
        </p>
      ) : null}
      {action ? <div className="mt-3 w-full max-w-[280px]">{action}</div> : null}
    </Card>
  );
}
