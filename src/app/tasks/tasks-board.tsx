"use client";

import { ScreenHeader } from "@/components/screen-header";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Card, SectionLabel } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PrimaryButton } from "@/components/ui/primary-button";
import { StatusPill, TokenBadge } from "@/components/ui/status";
import { ageLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useState, useTransition } from "react";
import { completeTaskAction, startTaskAction } from "./actions";

export type TaskRow = {
  id: string;
  visitId: string;
  tokenNumber: number | null;
  patientName: string;
  patientAgeLabel: { dateOfBirth: string | null; ageYears: number | null };
  procedureName: string;
  notes: string | null;
  consumables: { name: string; unit: string; quantity: number }[];
  state: string;
  assignedToName: string | null;
  orderedByDoctorName: string;
  orderedAt: string;
};

/**
 * Procedure and nursing tasks (§7.6) — the nurse tablet.
 *
 * Consumables are listed explicitly so the nurse collects them before
 * starting rather than mid-procedure. Completing a task is the write that
 * deducts stock (via FEFO, under the same expiry guarantees as a pharmacy
 * dispense) and adds the procedure's charge to the bill — the button says so,
 * because that consequence is not obvious from "Mark done".
 */
export function TasksBoard({ tasks }: { tasks: TaskRow[] }) {
  const [rows, setRows] = useState(tasks);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const active = rows.filter((t) => t.state !== "done");
  const done = rows.filter((t) => t.state === "done");

  const handleStart = (taskId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await startTaskAction(taskId);
      if (result.ok) {
        setRows((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, state: "in_progress" } : t,
          ),
        );
      } else {
        setError(result.error);
      }
    });
  };

  const handleComplete = (taskId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await completeTaskAction(taskId);
      if (result.ok) {
        setRows((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, state: "done" } : t)),
        );
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <>
      <ScreenHeader
        title="Nursing tasks"
        subtitle={`${active.length} to do · Tuesday, 18 July`}
      />

      {error ? (
        <div className="mb-4">
          <AlertBanner title={error} />
        </div>
      ) : null}

      {active.length === 0 ? (
        <EmptyState
          title="Nothing pending"
          hint="Procedures assigned by a doctor during consultation appear here the moment they are ordered."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {active.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              isPending={isPending}
              onStart={() => handleStart(task.id)}
              onComplete={() => handleComplete(task.id)}
            />
          ))}
        </div>
      )}

      {done.length > 0 ? (
        <div className="mt-7">
          <SectionLabel>Completed today</SectionLabel>
          <div className="flex flex-col gap-3">
            {done.map((task) => (
              <TaskCard key={task.id} task={task} isPending={false} />
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

function TaskCard({
  task,
  isPending,
  onStart,
  onComplete,
}: {
  task: TaskRow;
  isPending: boolean;
  onStart?: () => void;
  onComplete?: () => void;
}) {
  const isDone = task.state === "done";
  const isRunning = task.state === "in_progress";

  return (
    <Card className={cn("p-4", isDone && "opacity-60")}>
      <div className="flex items-start gap-4">
        {task.tokenNumber !== null ? (
          <TokenBadge number={task.tokenNumber} />
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-bold tracking-[-0.015em] text-ink">
              {task.procedureName}
            </h3>
            <StatusPill
              tone={isDone ? "success" : isRunning ? "accent" : "neutral"}
            >
              {isDone ? "Done" : isRunning ? "In progress" : "Pending"}
            </StatusPill>
          </div>

          <p className="mt-0.5 text-[14px] text-ink-secondary">
            {task.patientName} · {ageLabel(task.patientAgeLabel)}
          </p>

          {task.notes ? (
            <p className="mt-2 text-[15px] leading-snug text-ink">
              {task.notes}
            </p>
          ) : null}

          {task.consumables.length > 0 ? (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-secondary">
                Consumables
              </p>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {task.consumables.map((c) => (
                  <li key={c.name} className="text-[14px] text-ink">
                    {c.name} × {c.quantity}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="mt-3 text-[13px] text-ink-secondary">
            Ordered {formatTime(task.orderedAt)} by {task.orderedByDoctorName}
            {task.assignedToName ? ` · ${task.assignedToName}` : ""}
          </p>
        </div>
      </div>

      {!isDone ? (
        <div className="mt-4">
          <PrimaryButton
            onClick={isRunning ? onComplete : onStart}
            disabled={isPending}
          >
            {isRunning
              ? "Mark done — deduct stock & add to bill"
              : "Start procedure"}
          </PrimaryButton>
        </div>
      ) : null}
    </Card>
  );
}

/** ISO → "09:42" in clinic-local time. */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}
