import { ScreenHeader } from "@/components/screen-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import type { FollowUpRow } from "@/db/queries/home";
import type { StaffRole } from "@/lib/auth/claims";
import { formatPaise } from "@/lib/billing/gst";
import Link from "next/link";

/**
 * Role home (§7.8, §7.12).
 *
 * Every role gets a "what does my day look like" screen instead of one
 * app-wide dashboard — the owner's revenue pulse, the doctor's own queue and
 * follow-ups, front desk's counter view, the nurse's checklist, pharmacy's
 * stock alerts. A staff member holding several roles (§7.12 role stacking)
 * sees every section their roles unlock, concatenated on one screen rather
 * than forcing a tab switch.
 *
 * Every number here comes from a real query already used elsewhere in the
 * product (getQueue, getDashboard, getNursingTasks, …) — this screen adds no
 * new source of truth, only a role-shaped view onto the existing ones.
 */
export function HomeScreen({
  staffName,
  roles,
  doctorName,
  owner,
  doctor,
  frontDesk,
  nurse,
  pharmacy,
}: {
  staffName: string;
  roles: StaffRole[];
  doctorName: string | null;
  owner?: {
    monthVisits: number;
    monthRevenuePaise: number;
    newPatients: number;
    lowStockCount: number;
    expiringCount: number;
  };
  doctor?: {
    waitingForMe: number;
    withMeNow: number;
    followUps: FollowUpRow[];
    repsWaiting: number;
  };
  frontDesk?: {
    waitingCount: number;
    tokensToday: number;
    failedMessages: number;
  };
  nurse?: { pendingTasks: number; vaccinesDue: number };
  pharmacy?: {
    lowStockCount: number;
    expiringCount: number;
    dispenseQueueCount: number;
  };
}) {
  /* "Dr. Sameera Rahman" → "Sameera" — strip the honorific before taking the
     first token, or "Good day" greets the title instead of the person. */
  const firstName = (doctorName ?? staffName).replace(/^Dr\.\s+/, "").split(" ")[0];

  return (
    <>
      <ScreenHeader
        title={`Good day, ${firstName}`}
        subtitle={roles.map((r) => r.replace("_", " ")).join(" · ")}
      />

      {owner ? (
        <section className="mb-7">
          <SectionLabel>Clinic pulse — this month</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              tint="mint"
              label="Revenue"
              value={formatPaise(owner.monthRevenuePaise)}
            />
            <StatTile tint="sky" label="Visits" value={owner.monthVisits} />
            <StatTile tint="plain" label="New patients" value={owner.newPatients} />
          </div>
          {owner.lowStockCount > 0 || owner.expiringCount > 0 ? (
            <p className="mt-2 px-1 text-[13px] text-ink-secondary">
              {owner.lowStockCount > 0
                ? `${owner.lowStockCount} item${owner.lowStockCount > 1 ? "s" : ""} low on stock`
                : null}
              {owner.lowStockCount > 0 && owner.expiringCount > 0 ? " · " : null}
              {owner.expiringCount > 0
                ? `${owner.expiringCount} batch${owner.expiringCount > 1 ? "es" : ""} expiring soon`
                : null}
              {" — "}
              <Link href="/dashboard" className="font-semibold text-accent">
                see full report
              </Link>
            </p>
          ) : (
            <p className="mt-2 px-1 text-[13px] text-ink-secondary">
              <Link href="/dashboard" className="font-semibold text-accent">
                See full report
              </Link>
            </p>
          )}
        </section>
      ) : null}

      {doctor ? (
        <section className="mb-7">
          <SectionLabel>Your queue</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile tint="sky" label="With you now" value={doctor.withMeNow} />
            <StatTile tint="mint" label="Waiting for you" value={doctor.waitingForMe} />
            <StatTile tint="plain" label="Reps waiting" value={doctor.repsWaiting} />
          </div>

          {doctor.followUps.length > 0 ? (
            <Card className="mt-3 p-4">
              <h3 className="mb-2 text-[15px] font-bold text-ink">
                Follow-ups due today
              </h3>
              <ul className="flex flex-col gap-1.5">
                {doctor.followUps.map((f) => (
                  <li key={f.patientId} className="text-[14px] text-ink-secondary">
                    <span className="font-semibold text-ink">{f.patientName}</span>
                    {f.diagnosis ? ` — ${f.diagnosis}` : ""}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <p className="mt-2 px-1 text-[13px] text-ink-secondary">
            <Link href="/queue" className="font-semibold text-accent">
              Open the queue
            </Link>
            {doctor.repsWaiting > 0 ? (
              <>
                {" · "}
                <Link href="/mr" className="font-semibold text-accent">
                  See reps
                </Link>
              </>
            ) : null}
          </p>
        </section>
      ) : null}

      {frontDesk ? (
        <section className="mb-7">
          <SectionLabel>Front desk</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile tint="sky" label="Waiting now" value={frontDesk.waitingCount} />
            <StatTile tint="mint" label="Tokens today" value={frontDesk.tokensToday} />
            <StatTile
              tint="plain"
              label="Failed messages"
              value={frontDesk.failedMessages}
            />
          </div>
          <p className="mt-2 px-1 text-[13px] text-ink-secondary">
            <Link href="/reception" className="font-semibold text-accent">
              Open reception
            </Link>
            {frontDesk.failedMessages > 0 ? (
              <>
                {" · "}
                <Link href="/messages" className="font-semibold text-accent">
                  Review failed messages
                </Link>
              </>
            ) : null}
          </p>
        </section>
      ) : null}

      {nurse ? (
        <section className="mb-7">
          <SectionLabel>Nursing</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatTile tint="sky" label="Tasks pending" value={nurse.pendingTasks} />
            <StatTile tint="mint" label="Children due for vaccines" value={nurse.vaccinesDue} />
          </div>
          <p className="mt-2 px-1 text-[13px] text-ink-secondary">
            <Link href="/tasks" className="font-semibold text-accent">
              Open tasks
            </Link>
            {" · "}
            <Link href="/vaccinations" className="font-semibold text-accent">
              Open vaccinations
            </Link>
          </p>
        </section>
      ) : null}

      {pharmacy ? (
        <section className="mb-7">
          <SectionLabel>Pharmacy</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile tint="sky" label="Dispense queue" value={pharmacy.dispenseQueueCount} />
            <StatTile tint="mint" label="Low stock" value={pharmacy.lowStockCount} />
            <StatTile tint="plain" label="Expiring soon" value={pharmacy.expiringCount} />
          </div>
          <p className="mt-2 px-1 text-[13px] text-ink-secondary">
            <Link href="/pharmacy" className="font-semibold text-accent">
              Open pharmacy
            </Link>
          </p>
        </section>
      ) : null}
    </>
  );
}
