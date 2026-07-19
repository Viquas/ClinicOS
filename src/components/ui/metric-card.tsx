import { cn } from "@/lib/utils";
import { Card } from "./card";

/**
 * The heart of the design system (§8.1). Each vital owns a colour, and an
 * abnormal value flips the entire card into an alert state.
 *
 * The red card IS the alert — there is deliberately no icon, toast, or modal.
 * A nurse scanning six cards sees the abnormal one before reading any of them.
 */

export type MetricTone = "weight" | "height" | "temp" | "neutral";

const TONE_COLOR: Record<MetricTone, string> = {
  weight: "text-metric-weight",
  height: "text-metric-height",
  temp: "text-metric-temp",
  neutral: "text-ink",
};

export function MetricCard({
  label,
  value,
  unit,
  tone = "neutral",
  isAbnormal = false,
  /** Last visit's reading — catches 61.2 kg on a 4-year-old (§8.3 rule 2). */
  priorValue,
  note,
  isSkipped = false,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  tone?: MetricTone;
  isAbnormal?: boolean;
  priorValue?: string;
  note?: string;
  isSkipped?: boolean;
}) {
  return (
    <Card
      className={cn(
        "flex flex-col gap-1 p-4",
        isAbnormal && "bg-alert-surface shadow-none ring-1 ring-inset ring-alert/25",
      )}
    >
      <div
        className={cn(
          "text-[13px] font-semibold uppercase tracking-[0.04em]",
          isAbnormal ? "text-alert" : "text-ink-secondary",
        )}
      >
        {label}
      </div>

      {isSkipped ? (
        <div className="py-1 text-[17px] font-medium text-ink-secondary">
          Skipped
        </div>
      ) : (
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "tabular text-[40px] font-extrabold leading-[1.05] tracking-[-0.02em]",
              isAbnormal ? "text-alert" : TONE_COLOR[tone],
            )}
          >
            {value ?? "—"}
          </span>
          {unit ? (
            <span
              className={cn(
                "text-[15px] font-semibold",
                isAbnormal ? "text-alert" : "text-ink-secondary",
              )}
            >
              {unit}
            </span>
          ) : null}
        </div>
      )}

      {/*
       * The alert card carries copy, not just colour (§8.5) — `note` is where
       * "Fever — above 38°C" lands, so the state survives a greyscale screen.
       */}
      {note ? (
        <div
          className={cn(
            "text-[13px] font-medium",
            isAbnormal ? "text-alert" : "text-ink-secondary",
          )}
        >
          {note}
        </div>
      ) : null}

      {priorValue && !isSkipped ? (
        <div className="text-[13px] text-ink-secondary">Last: {priorValue}</div>
      ) : null}
    </Card>
  );
}
