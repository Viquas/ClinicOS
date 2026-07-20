import { getVaccinationRoster } from "@/db/queries/vaccinations";
import { getBookableDoctors } from "@/db/queries/queue";
import { clinicToday } from "@/lib/clinic-date";
import { tenantDb } from "@/db/tenant-db";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { requireRouteAccess } from "@/lib/auth/route-access";
import { VaccinationsBoard } from "./vaccinations-board";

/*
 * Always render against current clinic state — a due-list frozen at build
 * time would tell a nurse to chase a dose that was already given. Any page
 * reading mutable clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";


export default async function VaccinationsPage() {
  const TODAY = clinicToday();
  const clinicId = await getActiveClinicId();
  await requireRouteAccess(clinicId, "/vaccinations");
  const [roster, doctors] = await tenantDb((tx) =>
    Promise.all([
      getVaccinationRoster(clinicId, TODAY, tx),
      /* Only doctors who can still be booked supervise a new dose. */
      getBookableDoctors(clinicId, tx),
    ]),
  );
  return (
    <VaccinationsBoard
      roster={roster}
      doctors={doctors.map((d) => ({ id: d.id, name: d.name }))}
    />
  );
}
