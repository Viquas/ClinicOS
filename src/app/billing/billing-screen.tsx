"use client";

import { ScreenHeader } from "@/components/screen-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusPill } from "@/components/ui/status";
import type { BillDraft } from "@/db/queries/billing";
import { formatPaise, lineTotalPaise, type BillLine } from "@/lib/billing/gst";
import { cn } from "@/lib/utils";
import { Printer } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { recordBillAction } from "./actions";

/**
 * Billing (§7.7).
 *
 * The exempt/taxable split is shown explicitly rather than folded into one
 * "tax" line — the clinic's accountant needs to see which portion of the day's
 * takings was exempt supply. Goods bill at MRP with tax extracted, never
 * added, so the total matches the printed strip.
 *
 * The lines are computed on the server from what was actually dispensed; this
 * component only presents them and captures the payment mode.
 */
const MODES = [
  { value: "cash" as const, label: "Cash" },
  { value: "upi" as const, label: "UPI" },
  { value: "card" as const, label: "Card" },
];

export function BillingScreen({
  draft,
  tokenNumber,
  patientName,
}: {
  draft: BillDraft;
  tokenNumber: number;
  patientName: string;
}) {
  const [mode, setMode] = useState<"cash" | "upi" | "card">("upi");
  const [paid, setPaid] = useState(draft.alreadyBilled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const services = draft.lines.filter((l) => l.kind === "service");
  const goods = draft.lines.filter((l) => l.kind === "goods");
  const { totals } = draft;

  const collect = () => {
    setError(null);
    startTransition(async () => {
      const result = await recordBillAction({
        visitId: draft.visitId,
        /* Strip the display-only `key`; the server recomputes totals from
           these lines rather than trusting the preview. */
        lines: draft.lines.map(({ ...line }) => ({
          description: line.description,
          kind: line.kind,
          quantity: line.quantity,
          unitPaise: line.unitPaise,
          gstRate: line.gstRate,
        })),
        mode,
      });

      if (result.ok) setPaid(true);
      else setError(result.error);
    });
  };

  return (
    <>
      <ScreenHeader
        title="Billing"
        subtitle={`Token ${tokenNumber} · ${patientName}`}
        trailing={
          paid ? <StatusPill tone="success">Paid</StatusPill> : undefined
        }
      />

      <SectionLabel>Services — GST exempt</SectionLabel>
      <Card className="mb-4 overflow-hidden">
        {services.map((line) => (
          <LineRow key={line.key} line={line} />
        ))}
      </Card>

      {goods.length > 0 ? (
        <>
          <SectionLabel>Medicines &amp; consumables — taxable</SectionLabel>
          <Card className="mb-4 overflow-hidden">
            {goods.map((line) => (
              <LineRow key={line.key} line={line} showRate />
            ))}
          </Card>
        </>
      ) : null}

      <Card className="mb-5 p-5">
        <dl className="flex flex-col gap-2.5">
          <SummaryRow
            label="Exempt supply (services)"
            value={formatPaise(totals.exemptPaise)}
          />
          {totals.taxableGrossPaise > 0 ? (
            <>
              <SummaryRow
                label="Taxable value (goods, ex-GST)"
                value={formatPaise(totals.taxableNetPaise)}
              />
              <SummaryRow
                label={
                  draft.isGstRegistered ? "GST included" : "GST (not registered)"
                }
                value={formatPaise(totals.taxPaise)}
                hint={
                  draft.isGstRegistered
                    ? "Extracted from MRP, not added on top"
                    : undefined
                }
              />
            </>
          ) : null}

          <div className="mt-1 border-t border-hairline pt-3">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[17px] font-bold text-ink">Total payable</dt>
              <dd className="tabular text-[28px] font-extrabold tracking-[-0.025em] text-ink">
                {formatPaise(totals.payablePaise)}
              </dd>
            </div>
          </div>
        </dl>
      </Card>

      <SectionLabel>Payment</SectionLabel>
      <SegmentedControl
        className="mb-5"
        value={mode}
        onChange={setMode}
        options={MODES}
      />

      {error ? (
        <p className="mb-3 text-center text-[14px] font-semibold text-alert">
          {error}
        </p>
      ) : null}

      <PrimaryButton onClick={collect} disabled={paid || isPending}>
        {paid
          ? "Payment recorded"
          : isPending
            ? "Recording…"
            : `Collect ${formatPaise(totals.payablePaise)} by ${mode.toUpperCase()}`}
      </PrimaryButton>

      {paid ? (
        <Link
          href={`/print/bill/${draft.visitId}`}
          target="_blank"
          className="mt-3 flex min-h-[var(--touch-min)] items-center justify-center gap-2 rounded-[var(--radius-pill)] text-[16px] font-semibold text-accent ring-1 ring-inset ring-accent/40 transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Printer size={18} />
          Print or WhatsApp receipt
        </Link>
      ) : null}
    </>
  );
}

function LineRow({
  line,
  showRate,
}: {
  line: BillLine & { key: string };
  showRate?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-ink">
          {line.description}
        </div>
        <div className="text-[13px] text-ink-secondary">
          {line.quantity} × {formatPaise(line.unitPaise)}
          {showRate ? ` · GST ${line.gstRate}% incl.` : " · exempt"}
        </div>
      </div>
      <div className="tabular shrink-0 text-[16px] font-semibold text-ink">
        {formatPaise(lineTotalPaise(line))}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[15px] text-ink-secondary">
        {label}
        {hint ? (
          <span className={cn("block text-[12px] text-ink-secondary/70")}>
            {hint}
          </span>
        ) : null}
      </dt>
      <dd className="tabular text-[16px] font-semibold text-ink">{value}</dd>
    </div>
  );
}
