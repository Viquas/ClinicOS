import { getVaccinationRoster } from "@/db/queries/vaccinations";
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
  await requireRouteAccess(await getActiveClinicId(), "/vaccinations");
  const roster = await getVaccinationRoster(await getActiveClinicId(), TODAY);
  return <VaccinationsBoard roster={roster} />;
}
