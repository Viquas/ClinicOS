import { getClinicProfile } from "@/db/queries/clinic";
import { getRecordRevisions } from "@/db/queries/revisions";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { getAuditLog, getStaff } from "@/db/queries/staff";
import { getCurrentStaff } from "@/lib/auth/current-staff";
import { SettingsScreen } from "./settings-screen";

/*
 * Always render against current clinic state. Without this, Next statically
 * optimises the page in production and serves stale data — an audit log or
 * queue frozen at build time, which for a live clinic is not just wrong but
 * unsafe. Any page reading mutable clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";


export default async function SettingsPage() {
  const clinicId = await getActiveClinicId();
  const [staff, audit, currentStaff, clinic] = await Promise.all([
    getStaff(clinicId),
    getAuditLog(clinicId),
    getCurrentStaff(clinicId),
    getClinicProfile(clinicId),
  ]);

  /* Latest role/active change per member (P1 §7.8 polish) — the staff list
     is small, so one lookup per member stays cheap. */
  const lastChangeByStaffId = Object.fromEntries(
    await Promise.all(
      staff.map(async (member) => {
        const [latest] = await getRecordRevisions(clinicId, "staff", member.id);
        return [
          member.id,
          latest
            ? {
                byName: latest.editedByName,
                at: latest.at.toISOString().slice(0, 10),
                reason: latest.reason,
              }
            : null,
        ];
      }),
    ),
  );

  return (
    <SettingsScreen
      staff={staff}
      currentStaffId={currentStaff.id}
      currentStaffRoles={currentStaff.roles}
      clinic={clinic}
      lastChangeByStaffId={lastChangeByStaffId}
      audit={audit.map((a) => ({
        id: a.id,
        /* Serialise the timestamp for the client boundary. */
        at: a.at.toISOString(),
        actorName: a.actorName,
        action: a.action,
        detail: a.detail,
      }))}
    />
  );
}
