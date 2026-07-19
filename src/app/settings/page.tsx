import {
  getMonthlyPresence,
  getTodaysAttendance,
} from "@/db/queries/attendance";
import { getClinicProfile, getSwitchableClinics } from "@/db/queries/clinic";
import { clinicMonthBounds, clinicToday } from "@/lib/clinic-date";
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
  const switchableClinics = await getSwitchableClinics();

  /* Attendance for the staff tab: who is in right now, and how many days
     each person has been in this month (§7.8). */
  const today = clinicToday();
  const { start, end } = clinicMonthBounds();
  const [todaysAttendance, monthlyPresence] = await Promise.all([
    getTodaysAttendance(clinicId, today),
    getMonthlyPresence(clinicId, start, end),
  ]);

  const attendanceByStaffId = Object.fromEntries(
    staff.map((m) => {
      const open = todaysAttendance.find(
        (a) => a.staffId === m.id && a.checkOutAt === null,
      );
      const anyToday = todaysAttendance.find((a) => a.staffId === m.id);
      return [
        m.id,
        {
          isIn: Boolean(open),
          checkedInAt: (open ?? anyToday)?.checkInAt.toISOString() ?? null,
          daysPresent:
            monthlyPresence.find((p) => p.staffId === m.id)?.daysPresent ?? 0,
        },
      ];
    }),
  );

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
      switchableClinics={switchableClinics}
      activeClinicId={clinicId}
      lastChangeByStaffId={lastChangeByStaffId}
      attendanceByStaffId={attendanceByStaffId}
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
