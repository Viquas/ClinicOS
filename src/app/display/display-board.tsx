"use client";

import type { QueueEntry } from "@/db/queries/queue";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Doctor = { id: string; name: string };

/**
 * Waiting-room display (§7.2 P1) — TV mode.
 *
 * A different design problem from every other screen in the product:
 *
 *  · Read at three metres by someone with a toddler on their hip, so type is
 *    enormous and there is no interaction at all.
 *  · Visible to every patient in the room, so NO names, NO phone numbers and
 *    NO clinical information appear — only token numbers (§8.3 rule 5). This
 *    is the strictest privacy surface in the product, and the constraint is
 *    what makes it simple.
 *  · Runs unattended for hours on whatever TV the clinic already owns, so it
 *    is dark by default (a white screen at full brightness all day is
 *    unpleasant to sit under and burns in on cheap panels).
 *
 * Pulls its data from the server once per render, then calls router.refresh()
 * on the same clock tick that updates the on-screen time — this ran on frozen
 * mock data before, which for a screen that sits unattended for hours showing
 * live queue state to real patients is not a cosmetic gap.
 */
export function DisplayBoard({
  queue,
  doctors,
  clinicName,
}: {
  queue: QueueEntry[];
  doctors: Doctor[];
  clinicName: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState("");

  useEffect(() => {
    const tick = () => {
      setNow(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      router.refresh();
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [router]);

  return (
    /* Always dark — a waiting-room TV, never the app's day theme. The `dark`
       class resolves the design tokens to their dark values here regardless of
       the hour, so this screen uses the same tokens as everything else rather
       than re-typing their hex (which would silently drift if a token moved). */
    <main className="dark min-h-screen bg-canvas px-8 py-8 text-ink">
      <header className="mb-10 flex items-baseline justify-between">
        <h1 className="text-[44px] font-extrabold tracking-[-0.03em]">
          {clinicName}
        </h1>
        <span className="tabular text-[32px] font-bold text-ink-secondary">
          {now}
        </span>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        {doctors.map((doctor) => {
          const entries = queue
            .filter((e) => e.doctorId === doctor.id && e.state !== "closed")
            .sort((a, b) => {
              if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
              return a.number - b.number;
            });

          const serving = entries.find((e) => e.state === "with_doctor");
          const upcoming = entries
            .filter((e) => e.state !== "with_doctor")
            .slice(0, 4);

          return (
            <section
              key={doctor.id}
              className="rounded-[32px] bg-surface p-8"
            >
              <h2 className="text-[26px] font-bold text-ink-secondary">
                {doctor.name}
              </h2>

              <div className="mt-5">
                <p className="text-[18px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">
                  Now serving
                </p>
                <p
                  className={cn(
                    "tabular mt-1 font-extrabold leading-none tracking-[-0.04em]",
                    /* The single largest element in the product. It is read
                       from across a room by someone who is not looking at it
                       continuously. */
                    "text-[140px]",
                    /* #2a3f4d is a bespoke "empty big number" dim with no token
                       — dimmer than any surface, brighter than the canvas. */
                    serving ? "text-accent" : "text-[#2a3f4d]",
                  )}
                >
                  {serving ? serving.number : "—"}
                </p>
              </div>

              <div className="mt-6 border-t border-white/10 pt-5">
                <p className="text-[18px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">
                  Next
                </p>
                <ol className="mt-3 flex flex-wrap gap-3">
                  {upcoming.length === 0 ? (
                    <li className="text-[28px] font-semibold text-ink-secondary/70">
                      No one waiting
                    </li>
                  ) : (
                    upcoming.map((entry) => (
                      <li
                        key={entry.tokenId}
                        className={cn(
                          "tabular rounded-[20px] px-6 py-3 text-[46px] font-extrabold leading-none",
                          /* Priority is shown, but as emphasis only — the
                             reason for it is clinical and stays private. */
                          entry.isPriority
                            ? "bg-alert/15 text-alert"
                            : "bg-white/[0.07] text-ink",
                        )}
                      >
                        {entry.number}
                      </li>
                    ))
                  )}
                </ol>
              </div>
            </section>
          );
        })}
      </div>

      <footer className="mt-10 text-center text-[20px] text-ink-secondary/70">
        Please wait for your number to be called
      </footer>
    </main>
  );
}
