import { getVaccinationRoster } from "@/db/queries/vaccinations";
import { requireRouteAccess } from "@/lib/auth/route-access";
import { VaccinationsBoard } from "./vaccinations-board";

/*
 * Always render against current clinic state — a due-list frozen at build
 * time would tell a nurse to chase a dose that was already given. Any page
 * reading mutable clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";

/* Until auth is wired, the clinic and date are fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const TODAY = "2026-07-18";

export default async function VaccinationsPage() {
  await requireRouteAccess(CLINIC_ID, "/vaccinations");
  const roster = await getVaccinationRoster(CLINIC_ID, TODAY);
  return <VaccinationsBoard roster={roster} />;
}
