"use client";

import { ScreenHeader } from "@/components/screen-header";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Card, SectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PrimaryButton } from "@/components/ui/primary-button";
import { StatusPill } from "@/components/ui/status";
import type { DispensingContext } from "@/db/queries/dispensing";
import { daysToExpiry, isExpired, selectableBatches } from "@/lib/pharmacy/fefo";
import { titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMemo, useState, useTransition } from "react";
import { dispenseAction } from "./actions";

/**
 * Pharmacy dispensing counter (§7.5).
 *
 * FEFO pre-selects the nearest-expiry batch; the operator may override it, but
 * an expired batch is not selectable at all and renders struck through with
 * the reason — hiding it would make the pharmacist think the stock is missing
 * and go hunting for it.
 *
 * The screen decides the selection; the server decides whether it is allowed.
 * The dispense mutation re-checks expiry and quantity against the locked row,
 * so a stale page cannot dispense a batch that expired since it loaded.
 */
export function PharmacyCounter({
  context,
  today,
}: {
  context: DispensingContext;
  /** The clinic's own "today" (YYYY-MM-DD), resolved server-side. Noon UTC
      keeps `toIsoDate` on the same calendar day the query filtered against. */
  today: string;
}) {
  const TODAY = useMemo(() => new Date(`${today}T12:00:00Z`), [today]);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ batchNo: string; quantity: number }[] | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const rows = useMemo(
    () =>
      context.lines.map((line) => {
        const selectable = selectableBatches(line.batches, TODAY);
        const selectedId = chosen[line.prescriptionItemId] ?? selectable[0]?.id;
        const available = selectable.reduce(
          (sum, b) => sum + b.quantityRemaining,
          0,
        );
        return { line, selectable, selectedId, available };
      }),
    [context.lines, chosen, TODAY],
  );

  const shortfalls = rows.filter((r) => r.available < r.line.quantity);
  const h1Lines = rows.filter((r) => r.line.scheduleClass === "h1");
  const dispensable = rows.filter((r) => r.selectedId);

  const handleDispense = () => {
    setError(null);
    startTransition(async () => {
      const result = await dispenseAction({
        visitId: context.visitId,
        lines: dispensable.map((r) => ({
          batchId: r.selectedId!,
          quantity: r.line.quantity,
        })),
        patient: { id: context.patient.id, name: context.patient.name },
        doctor: context.doctor,
      });

      if (result.ok) setDone(result.dispensed);
      else setError(result.error);
    });
  };

  if (done) {
    return (
      <>
        <ScreenHeader
          title="Pharmacy"
          subtitle={`Token ${context.tokenNumber} · ${context.patient.name}`}
        />
        <EmptyState
          title="Dispensed"
          hint={`${done.length} item${done.length > 1 ? "s" : ""} dispensed. Stock decremented against the selected batches, and any Schedule H1 lines recorded in the register.`}
        />
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title="Pharmacy"
        subtitle={`Token ${context.tokenNumber} · ${context.patient.name} · ${titleCase(context.patient.sex)}`}
      />

      {error ? (
        <div className="mb-4">
          <AlertBanner title={error} />
        </div>
      ) : null}

      {context.lines.length === 0 ? (
        <EmptyState
          title="No prescription on this visit"
          hint="Nothing was sent from the consultation to dispense."
        />
      ) : (
        <>
          {shortfalls.length > 0 ? (
            <div className="mb-4">
              <AlertBanner
                tone="warning"
                title="Not enough stock for every line"
                detail={`${shortfalls
                  .map((s) => s.line.drugName)
                  .join(", ")} — dispense partially and record the rest as bought outside.`}
              />
            </div>
          ) : null}

          <SectionLabel>Prescription</SectionLabel>
          <div className="flex flex-col gap-3">
            {rows.map(({ line, selectable, selectedId, available }) => {
              const short = available < line.quantity;

              return (
                <Card key={line.prescriptionItemId} className="p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[17px] font-bold tracking-[-0.015em] text-ink">
                        {line.drugName}
                      </h3>
                      {line.scheduleClass !== "none" ? (
                        <StatusPill tone="warning">
                          Schedule {line.scheduleClass.toUpperCase()}
                        </StatusPill>
                      ) : null}
                    </div>
                    <span className="tabular text-[15px] font-semibold text-ink-secondary">
                      need {line.quantity} {line.unit ?? ""}
                    </span>
                  </div>

                  <p className="mt-0.5 text-[14px] text-ink-secondary">
                    {line.strength ?? ""}
                    {line.strength ? " · " : ""}
                    <span className={short ? "text-warning" : "text-success"}>
                      {available} {line.unit ?? "units"} available
                    </span>
                  </p>

                  {line.batches.length === 0 ? (
                    <p className="mt-3 text-[14px] text-alert">
                      Out of stock — not held in this clinic&apos;s formulary as a
                      batch.
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-col gap-2">
                      {line.batches.map((batch) => {
                        const expired = isExpired(batch, TODAY);
                        const days = daysToExpiry(batch, TODAY);
                        const isSelected = batch.id === selectedId;
                        const isFefoPick = selectable[0]?.id === batch.id;

                        return (
                          <button
                            key={batch.id}
                            disabled={expired || batch.quantityRemaining <= 0}
                            onClick={() =>
                              setChosen((prev) => ({
                                ...prev,
                                [line.prescriptionItemId]: batch.id,
                              }))
                            }
                            className={cn(
                              "flex min-h-[var(--touch-min)] items-center gap-3 rounded-[var(--radius-control)] px-3.5 py-3 text-left",
                              "transition-colors duration-150",
                              expired
                                ? "cursor-not-allowed bg-alert-surface"
                                : isSelected
                                  ? "bg-accent-soft ring-2 ring-inset ring-accent"
                                  : "bg-surface-sunken",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div
                                className={cn(
                                  "tabular text-[15px] font-bold",
                                  expired ? "text-alert line-through" : "text-ink",
                                )}
                              >
                                {batch.batchNo}
                              </div>
                              <div
                                className={cn(
                                  "text-[13px]",
                                  expired ? "text-alert" : "text-ink-secondary",
                                )}
                              >
                                {expired
                                  ? `Expired ${Math.abs(days)} days ago — cannot dispense`
                                  : `Expires ${batch.expiryDate} · ${batch.quantityRemaining} ${line.unit ?? ""} left`}
                              </div>
                            </div>

                            {expired ? (
                              <StatusPill tone="alert">Blocked</StatusPill>
                            ) : isFefoPick ? (
                              <StatusPill tone="success">
                                {days <= 60 ? `FEFO · ${days}d left` : "FEFO pick"}
                              </StatusPill>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {h1Lines.length > 0 ? (
            <div className="mt-4">
              <AlertBanner
                tone="warning"
                title="Schedule H1 register entry will be created"
                detail={`${h1Lines
                  .map((l) => l.line.drugName)
                  .join(", ")} — patient, doctor, drug, batch and quantity are recorded automatically.`}
              />
            </div>
          ) : null}

          <div className="mt-6">
            <PrimaryButton
              onClick={handleDispense}
              disabled={isPending || dispensable.length === 0}
            >
              {isPending ? "Dispensing…" : "Dispense & add to bill"}
            </PrimaryButton>
          </div>
        </>
      )}
    </>
  );
}
