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

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

export default async function SettingsPage() {
  const [staff, audit, currentStaff] = await Promise.all([
    getStaff(CLINIC_ID),
    getAuditLog(CLINIC_ID),
    getCurrentStaff(CLINIC_ID),
  ]);

  return (
    <SettingsScreen
      staff={staff}
      currentStaffId={currentStaff.id}
      currentStaffRoles={currentStaff.roles}
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
