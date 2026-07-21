import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Allergy and expiry banners (§8.3 rules 1 and 6).
 *
 * Allergies render above all other content on the patient chart and travel to
 * the prescription screen pinned. This component is intentionally not
 * dismissible: a banner a doctor can close is a banner that stops working.
 */
export function AlertBanner({
  tone = "alert",
  title,
  detail,
  action,
}: {
  /*
   * `success` (green) exists so a confirmation never has to borrow the amber
   * warning tone — doing so undercuts the whole "colour carries meaning"
   * discipline. `alert` stays exclusively clinical urgency (§8.3).
   */
  tone?: "alert" | "warning" | "success";
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  const surface =
    tone === "alert"
      ? "bg-alert-surface ring-alert/25"
      : tone === "success"
        ? "bg-success-surface ring-success/25"
        : "bg-warning-surface ring-warning/25";
  const accent =
    tone === "alert"
      ? "bg-alert"
      : tone === "success"
        ? "bg-success"
        : "bg-warning";
  const text =
    tone === "alert"
      ? "text-alert"
      : tone === "success"
        ? "text-success"
        : "text-warning";

  return (
    <div
      role={tone === "success" ? "status" : "alert"}
      className={cn(
        "flex items-start gap-3 rounded-[var(--radius-card)] px-4 py-3.5 ring-1 ring-inset",
        surface,
      )}
    >
      {/*
       * The dot is decorative reinforcement only. Everything it conveys is
       * also in the text, so aria-hidden keeps it out of the a11y tree.
       */}
      <span
        aria-hidden
        className={cn("mt-[7px] h-2 w-2 shrink-0 rounded-full", accent)}
      />
      <div className="min-w-0 flex-1">
        <div
          className={cn("text-[15px] font-bold tracking-[-0.01em]", text)}
        >
          {title}
        </div>
        {detail ? (
          <div className="mt-0.5 text-[14px] leading-snug text-ink">
            {detail}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
