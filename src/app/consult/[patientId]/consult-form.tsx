"use client";

import { AlertBanner } from "@/components/ui/alert-banner";
import { Card, SectionLabel } from "@/components/ui/card";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { IdentityHeader } from "@/components/ui/identity-header";
import { PrimaryButton, SecondaryButton } from "@/components/ui/primary-button";
import { StatusPill } from "@/components/ui/status";
import { findAllergyConflicts } from "@/lib/clinical/allergy";
import { ageLabel, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Check, Plus, Printer, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recordConsultationAction } from "./actions";

/* Scenario date — becomes the real clock once the seed uses live dates. */

type Patient = {
  id: string;
  name: string;
  sex: string;
  dateOfBirth: string | null;
  ageYears: number | null;
  allergies: string[];
  tags: string[];
};

type StockItem = {
  id: string;
  name: string;
  strength: string | null;
  unit: string;
  scheduleClass: string;
  quantity: number;
};

type Line = {
  id: string;
  inventoryItemId: string | null;
  drugName: string;
  strength: string | null;
  dosage: string;
  durationDays: number;
  scheduleClass: string;
  overrideReason?: string;
};

/**
 * Consultation (§7.4) — the 90-second screen.
 *
 * Three things are load-bearing here:
 *  1. The allergy banner is pinned above everything and travels from the chart.
 *  2. The prescription picker shows clinic stock FIRST with live quantities,
 *     because a prescription the clinic can fill is worth more than a
 *     theoretically better one it cannot.
 *  3. Prescribing into an allergy class demands a typed reason. No reason,
 *     no add — the override is deliberately slower than the safe path.
 *
 * A diagnosis alone closes the visit — a prescription is not required, and
 * a doctor with no prescribing registration (§9.2) can still complete a
 * visit; they are only blocked from adding drugs to it, which is what
 * `canPrescribe` gates.
 */
export function ConsultForm({
  today,
  visitId,
  tokenId,
  doctorId,
  canPrescribe,
  patient,
  vitals,
  diagnosisFavourites,
  stock,
}: {
  /* The clinic's date, resolved on the server and passed down so an
     age label cannot disagree between server and client render. */
  today: string;
  visitId: string;
  tokenId: string;
  doctorId: string;
  canPrescribe: boolean;
  patient: Patient;
  vitals: Record<string, number | string> | null;
  diagnosisFavourites: string[];
  stock: StockItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState("");
  const [advice, setAdvice] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [pending, setPending] = useState<StockItem | null>(null);
  const [reason, setReason] = useState("");

  const weightKg = vitals?.weightKg;

  const addLine = (item: StockItem, overrideReason?: string) => {
    setLines((prev) => [
      ...prev,
      {
        id: item.id,
        inventoryItemId: item.id,
        drugName: item.name,
        strength: item.strength,
        dosage: "1-0-1",
        durationDays: 3,
        scheduleClass: item.scheduleClass,
        overrideReason,
      },
    ]);
  };

  const attemptAdd = (item: StockItem) => {
    const conflicts = findAllergyConflicts(item.name, patient.allergies);
    if (conflicts.length > 0) {
      /* Do not add yet — the override dialog below is the only way through. */
      setPending(item);
      setReason("");
      return;
    }
    addLine(item);
  };

  const pendingConflicts = pending
    ? findAllergyConflicts(pending.name, patient.allergies)
    : [];

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await recordConsultationAction({
        visitId,
        tokenId,
        doctorId,
        diagnosis,
        advice,
        followUpDate: followUpDate || null,
        lines: lines.map((l) => ({
          inventoryItemId: l.inventoryItemId,
          drugName: l.drugName,
          strength: l.strength,
          dosage: l.dosage,
          durationDays: l.durationDays,
          scheduleClass: l.scheduleClass,
          allergyOverrideReason: l.overrideReason ?? null,
        })),
      });
      if (result.ok) {
        /* A prescription was written — pause on a handoff so the doctor can
           print or WhatsApp it while the patient is still in the room. An
           advice-only visit has nothing to hand over, so it returns straight
           to the queue as before. */
        if (lines.length > 0) setSaved(true);
        else router.push("/queue");
      } else {
        setError(result.error);
      }
    });
  };

  if (saved) {
    return (
      <div className="mx-auto max-w-[440px] pt-8">
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Check size={30} />
          </span>
          <h1 className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">
            Consultation saved
          </h1>
          <p className="max-w-[34ch] text-[15px] leading-snug text-ink-secondary">
            {patient.name}&apos;s prescription is ready. Hand it over now, or go
            back — you can always reprint it from the patient&apos;s record.
          </p>

          <Link
            href={`/print/rx/${visitId}`}
            target="_blank"
            className="mt-3 flex w-full min-h-[var(--touch-primary)] items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-accent px-6 text-[17px] font-semibold text-accent-ink shadow-[0_8px_20px_-8px_var(--accent)] transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Printer size={19} />
            Print or WhatsApp prescription
          </Link>
          <button
            onClick={() => router.push("/queue")}
            className="min-h-[var(--touch-min)] text-[16px] font-semibold text-accent"
          >
            Done — back to queue
          </button>
        </Card>
      </div>
    );
  }

  return (
    <>
      <IdentityHeader
        name={patient.name}
        ageLabel={ageLabel(patient, today)}
        sex={titleCase(patient.sex)}
        /* Consultation room is private — front desk masks, this does not. */
        maskContact={false}
        tags={patient.tags}
        trailing={
          weightKg ? (
            <div className="text-right">
              <div className="tabular text-[24px] font-extrabold text-ink">
                {weightKg}
              </div>
              <div className="text-[12px] font-semibold text-ink-secondary">kg</div>
            </div>
          ) : null
        }
      />

      {/* Rule 1: above all other content, always. */}
      {patient.allergies.length > 0 ? (
        <div className="mt-4">
          <AlertBanner
            title={`Allergy — ${patient.allergies.join(", ")}`}
            detail="Prescribing in this class needs an explicit reason."
          />
        </div>
      ) : null}

      {!canPrescribe ? (
        <div className="mt-3">
          <AlertBanner
            tone="warning"
            title="Prescription blocked — doctor profile incomplete"
            detail="Add the state medical council registration number in Settings before issuing prescriptions."
          />
        </div>
      ) : null}

      {error ? (
        <div className="mt-3">
          <AlertBanner title={error} />
        </div>
      ) : null}

      <div className="mt-6">
        <SectionLabel>Diagnosis</SectionLabel>
        <Card className="p-4">
          <input
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            placeholder="Type or pick a favourite"
            className={cn(
              "w-full bg-transparent text-[19px] font-medium text-ink",
              "outline-none placeholder:font-normal placeholder:text-ink-secondary/60",
            )}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {diagnosisFavourites.map((fav) => (
              <button
                key={fav}
                onClick={() => setDiagnosis(fav)}
                className={cn(
                  "min-h-[38px] rounded-[var(--radius-pill)] px-3.5",
                  "text-[14px] font-semibold transition-colors duration-150",
                  diagnosis === fav
                    ? "bg-accent text-accent-ink"
                    : "bg-surface-sunken text-ink-secondary",
                )}
              >
                {fav}
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <SectionLabel>Advice &amp; follow-up</SectionLabel>
        <Card className="p-4">
          <textarea
            value={advice}
            onChange={(e) => setAdvice(e.target.value)}
            placeholder="Advice for the family (optional)"
            rows={2}
            className={cn(
              "w-full resize-none bg-transparent text-[16px] text-ink",
              "outline-none placeholder:text-ink-secondary/60",
            )}
          />
          <label className="mt-3 block">
            <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
              Follow-up date (optional)
            </span>
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className={cn(
                "mt-1 min-h-[var(--touch-min)] w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5",
                "text-[16px] text-ink outline-none",
              )}
            />
          </label>
        </Card>
      </div>

      <div className="mt-6">
        <SectionLabel>Prescription</SectionLabel>

        {lines.length > 0 ? (
          <div className="mb-3 flex flex-col gap-2">
            {lines.map((line) => (
              <Card key={line.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[16px] font-bold text-ink">
                      {line.drugName}
                    </span>
                    {line.overrideReason ? (
                      <StatusPill tone="alert">Allergy override</StatusPill>
                    ) : null}
                  </div>
                  <div className="text-[14px] text-ink-secondary">
                    {line.dosage} · {line.durationDays} days
                    {line.overrideReason ? ` · ${line.overrideReason}` : ""}
                  </div>
                </div>
                <button
                  aria-label={`Remove ${line.drugName}`}
                  onClick={() =>
                    setLines((prev) => prev.filter((l) => l.id !== line.id))
                  }
                  className="flex h-11 w-11 items-center justify-center rounded-full text-ink-secondary active:bg-surface-sunken"
                >
                  <X size={18} />
                </button>
              </Card>
            ))}
          </div>
        ) : null}

        <p className="mb-2 px-1 text-[13px] font-medium text-ink-secondary">
          In stock at this clinic
        </p>
        <div className="flex flex-col gap-2">
          {stock.map((item) => {
            const conflicts = findAllergyConflicts(item.name, patient.allergies);
            const added = lines.some((l) => l.inventoryItemId === item.id);

            return (
              <Card
                key={item.id}
                className={cn(
                  "flex items-center gap-3 p-4",
                  conflicts.length > 0 && "ring-1 ring-inset ring-alert/30",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[16px] font-semibold text-ink">
                      {item.name}
                    </span>
                    {item.scheduleClass !== "none" ? (
                      <StatusPill tone="warning">
                        Schedule {item.scheduleClass.toUpperCase()}
                      </StatusPill>
                    ) : null}
                    {conflicts.length > 0 ? (
                      <StatusPill tone="alert">
                        {conflicts[0].crossSensitivity
                          ? "Cross-sensitivity"
                          : "Allergy"}
                      </StatusPill>
                    ) : null}
                  </div>
                  <div className="text-[14px] text-ink-secondary">
                    {item.strength ?? item.unit} ·{" "}
                    <span
                      className={item.quantity > 0 ? "text-success" : "text-alert"}
                    >
                      {item.quantity > 0
                        ? `${item.quantity} ${item.unit} in stock`
                        : "Out of stock"}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => attemptAdd(item)}
                  disabled={added || !canPrescribe}
                  aria-label={`Add ${item.name}`}
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                    "transition-colors duration-150 disabled:opacity-40",
                    added ? "bg-accent-soft text-accent" : "bg-accent text-accent-ink",
                  )}
                >
                  {added ? <Check size={18} /> : <Plus size={18} />}
                </button>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="mt-7">
        <PrimaryButton
          disabled={!diagnosis.trim() || isPending}
          onClick={handleSave}
        >
          {isPending ? "Saving…" : "Save & send to pharmacy"}
        </PrimaryButton>
      </div>

      {/*
        Override dialog — the only path to prescribing into an allergy.

        No z-index here any more: Dialog renders in the browser's top layer,
        which outranks the z-50 bottom nav unconditionally. This used to be
        z-[60] to stop the nav painting over "Prescribe anyway" at mobile
        width; that class of bug is now structurally impossible.
      */}
      {pending ? (
        <Dialog onClose={() => setPending(null)}>
          <Card className="w-full max-w-md p-5">
            <DialogTitle className="text-[19px] font-extrabold tracking-[-0.02em] text-alert">
              {pendingConflicts[0]?.crossSensitivity
                ? "Cross-sensitivity warning"
                : "Recorded allergy"}
            </DialogTitle>
            <p className="mt-1.5 text-[15px] leading-snug text-ink">
              {patient.name} has a recorded allergy to{" "}
              <strong>{pendingConflicts[0]?.recordedAllergy}</strong>.{" "}
              {pending.name} is{" "}
              {pendingConflicts[0]?.crossSensitivity
                ? "cross-reactive with"
                : "in"}{" "}
              the {pendingConflicts[0]?.matchedClass} class.
            </p>

            <label
              htmlFor="override-reason"
              className="mt-4 block text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-secondary"
            >
              Reason for overriding
            </label>
            <input
              id="override-reason"
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. previous reaction was mild, no alternative"
              className={cn(
                "mt-1.5 w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5 py-3",
                "text-[16px] text-ink outline-none placeholder:text-ink-secondary/60",
              )}
            />

            <div className="mt-5 flex items-center gap-3">
              <SecondaryButton onClick={() => setPending(null)}>
                Cancel
              </SecondaryButton>
              <div className="flex-1">
                <PrimaryButton
                  /* No reason, no override. The safe path stays faster. */
                  disabled={reason.trim().length < 4}
                  onClick={() => {
                    addLine(pending, reason.trim());
                    setPending(null);
                  }}
                >
                  Prescribe anyway
                </PrimaryButton>
              </div>
            </div>
          </Card>
        </Dialog>
      ) : null}
    </>
  );
}
