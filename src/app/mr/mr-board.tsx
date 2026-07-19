"use client";

import { ScreenHeader } from "@/components/screen-header";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Card, GroupedList, Row, SectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PrimaryButton, SecondaryButton } from "@/components/ui/primary-button";
import { StatusPill } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { useState, useTransition } from "react";
import {
  checkInRepAction,
  logWalkInRepAction,
  markRepSeenAction,
} from "./actions";

/**
 * Medical rep management (§7.9) — the module no mainstream competitor does
 * well, and the one every doctor deals with daily.
 *
 * The entire point is that this queue is SEPARATE. Reps never enter the
 * patient token sequence, never appear on the doctor's patient queue, and
 * cannot push a waiting child back. The visual separation is the feature.
 *
 * There is no slot-capacity or sample-inventory tracking in the schema yet —
 * the earlier mock invented both. This shows only what §7.9's data actually
 * carries: who's booked, who's waiting, who's been seen, and when they last
 * visited.
 */

type RepRow = {
  visitId: string;
  repId: string;
  name: string;
  companyName: string;
  division: string | null;
  phone: string | null;
  state: "booked" | "waiting" | "seen";
  scheduledFor: string | null;
  checkedInAt: string | null;
  lastVisit: string | null;
};

type DirectoryRep = { id: string; name: string; companyName: string };
type Doctor = { id: string; name: string };

export function MrBoard({
  reps,
  directory,
  doctors,
}: {
  reps: RepRow[];
  directory: DirectoryRep[];
  doctors: Doctor[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [walkInRepId, setWalkInRepId] = useState(directory[0]?.id ?? "");
  const [walkInDoctorId, setWalkInDoctorId] = useState(doctors[0]?.id ?? "");

  const waiting = reps.filter((r) => r.state === "waiting");
  const booked = reps.filter((r) => r.state === "booked");
  const seen = reps.filter((r) => r.state === "seen");

  const handleCheckIn = (visitId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await checkInRepAction(visitId);
      if (!result.ok) setError(result.error);
    });
  };

  const handleMarkSeen = (visitId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await markRepSeenAction(visitId);
      if (!result.ok) setError(result.error);
    });
  };

  const handleLogWalkIn = () => {
    if (!walkInRepId || !walkInDoctorId) return;
    setError(null);
    startTransition(async () => {
      const result = await logWalkInRepAction(walkInRepId, walkInDoctorId);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <>
      <ScreenHeader
        title="Medical reps"
        subtitle={`${reps.length} today`}
      />

      {/* States the guarantee out loud — it is the module's whole promise. */}
      <div className="mb-5">
        <AlertBanner
          tone="warning"
          title="Separate from the patient queue"
          detail="Reps never take a patient token and cannot delay a waiting patient."
        />
      </div>

      {error ? (
        <div className="mb-4">
          <AlertBanner title={error} />
        </div>
      ) : null}

      {waiting.length > 0 ? (
        <div className="mb-6">
          <SectionLabel>At reception now</SectionLabel>
          <div className="flex flex-col gap-3">
            {waiting.map((rep) => (
              <Card key={rep.visitId} className="p-4">
                <div className="flex items-start gap-3">
                  <div
                    aria-hidden
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
                      "bg-surface-sunken text-[15px] font-bold text-ink-secondary",
                    )}
                  >
                    {rep.companyName.slice(0, 2).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-[17px] font-bold tracking-[-0.015em] text-ink">
                      {rep.name}
                    </h3>
                    <p className="text-[14px] text-ink-secondary">
                      {rep.companyName}
                      {rep.division ? ` · ${rep.division}` : ""}
                      {rep.scheduledFor ? ` · slot ${formatTime(rep.scheduledFor)}` : ""}
                    </p>
                    {rep.lastVisit ? (
                      <p className="mt-1 text-[13px] text-ink-secondary">
                        Last visit {rep.lastVisit}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <SecondaryButton
                    disabled={isPending}
                    onClick={() => handleMarkSeen(rep.visitId)}
                  >
                    Mark as seen
                  </SecondaryButton>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      <SectionLabel>Booked today</SectionLabel>
      {booked.length === 0 ? (
        <EmptyState
          title="No reps booked"
          hint="Nothing here means the window is free."
        />
      ) : (
        <GroupedList className="mb-6">
          {booked.map((rep) => (
            <Row
              key={rep.visitId}
              title={rep.name}
              subtitle={`${rep.companyName}${rep.division ? ` · ${rep.division}` : ""}${rep.scheduledFor ? ` · ${formatTime(rep.scheduledFor)}` : ""}`}
              trailing={
                <button
                  disabled={isPending}
                  onClick={() => handleCheckIn(rep.visitId)}
                  className="min-h-[40px] rounded-[var(--radius-pill)] bg-accent px-4 text-[14px] font-semibold text-accent-ink disabled:opacity-40"
                >
                  Check in
                </button>
              }
            />
          ))}
        </GroupedList>
      )}

      {seen.length > 0 ? (
        <div className="mt-6 mb-7">
          <SectionLabel>Seen today</SectionLabel>
          <GroupedList>
            {seen.map((rep) => (
              <Row
                key={rep.visitId}
                title={rep.name}
                subtitle={rep.companyName}
                trailing={<StatusPill tone="success">Seen</StatusPill>}
              />
            ))}
          </GroupedList>
        </div>
      ) : null}

      {directory.length > 0 && doctors.length > 0 ? (
        <>
          <SectionLabel>Log a walk-in</SectionLabel>
          <Card className="mb-6 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
                  Rep
                </span>
                <select
                  value={walkInRepId}
                  onChange={(e) => setWalkInRepId(e.target.value)}
                  className={cn(
                    "mt-1 min-h-[var(--touch-min)] w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5",
                    "text-[16px] text-ink outline-none",
                  )}
                >
                  {directory.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.name} · {rep.companyName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
                  Doctor
                </span>
                <select
                  value={walkInDoctorId}
                  onChange={(e) => setWalkInDoctorId(e.target.value)}
                  className={cn(
                    "mt-1 min-h-[var(--touch-min)] w-full rounded-[var(--radius-control)] bg-surface-sunken px-3.5",
                    "text-[16px] text-ink outline-none",
                  )}
                >
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 max-w-sm">
              <PrimaryButton disabled={isPending} onClick={handleLogWalkIn}>
                Log walk-in
              </PrimaryButton>
            </div>
          </Card>
        </>
      ) : null}
    </>
  );
}

/** ISO → "14:00" in clinic-local time. */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}
