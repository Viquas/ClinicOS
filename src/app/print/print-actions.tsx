"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Printer, Send } from "lucide-react";
import { logShareAction } from "./actions";

/**
 * The action bar above a printable document. It is `print:hidden`, so it never
 * lands on paper — the sheet below it is the document, this is only the
 * controls for it.
 *
 * Deliberately fixed to the top and off the sheet: on a shared clinic tablet
 * the person printing is often not the doctor, and "Print" / "Send on
 * WhatsApp" need to be the two obvious things to do, reachable without
 * scrolling past the whole slip.
 */
export function PrintActions({
  waLink,
  waLabel = "Send on WhatsApp",
  share,
}: {
  /** Prebuilt wa.me URL, or null when the patient has no dialable number. */
  waLink: string | null;
  waLabel?: string;
  /** When set, opening WhatsApp also writes a "shared" row to the log. */
  share?: {
    templateName:
      | "prescription_share"
      | "bill_receipt_share"
      | "vaccination_reminder_share";
    toPhone: string;
    patientName: string;
  };
}) {
  const router = useRouter();

  return (
    <div className="print:hidden sticky top-0 z-10 flex items-center gap-3 border-b border-hairline bg-canvas/90 px-4 py-3 backdrop-blur-sm">
      <button
        onClick={() => router.back()}
        className="flex min-h-[var(--touch-min)] items-center gap-1.5 rounded-[var(--radius-control)] px-3 text-[15px] font-medium text-ink-secondary transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label="Go back"
      >
        <ArrowLeft size={18} />
        Back
      </button>

      <div className="flex-1" />

      {waLink ? (
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            if (share) void logShareAction(share);
          }}
          className="flex min-h-[var(--touch-min)] items-center gap-2 rounded-[var(--radius-pill)] px-4 text-[15px] font-semibold text-accent ring-1 ring-inset ring-accent/40 transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Send size={17} />
          {waLabel}
        </a>
      ) : null}

      <button
        onClick={() => window.print()}
        className="flex min-h-[var(--touch-min)] items-center gap-2 rounded-[var(--radius-pill)] bg-accent px-5 text-[15px] font-semibold text-accent-ink shadow-[0_8px_20px_-8px_var(--accent)] transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Printer size={17} />
        Print
      </button>
    </div>
  );
}
