import { getVaccinationRoster } from "@/db/queries/vaccinations";
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

const TODAY = "2026-07-18";

export default async function VaccinationsPage() {
  const clinicId = await getActiveClinicId();
  await requireRouteAccess(clinicId, "/vaccinations");
  const roster = await tenantDb((tx) =>
    getVaccinationRoster(clinicId, TODAY, tx),
  );
  return <VaccinationsBoard roster={roster} />;
}
