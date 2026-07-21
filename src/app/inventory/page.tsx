import { getStock } from "@/db/queries/pharmacy";
import { clinicToday } from "@/lib/clinic-date";
import { tenantDb } from "@/db/tenant-db";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { requireRouteAccess } from "@/lib/auth/route-access";
import { getH1Register } from "@/db/queries/h1-register";
import { InventoryBoard } from "./inventory-board";

/*
 * Always render against current clinic state. Without this, Next statically
 * optimises the page in production and serves stale data — an audit log or
 * queue frozen at build time, which for a live clinic is not just wrong but
 * unsafe. Any page reading mutable clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";


export default async function InventoryPage() {
  const clinicId = await getActiveClinicId();
  await requireRouteAccess(clinicId, "/inventory");
  const [stock, h1] = await tenantDb((tx) =>
    Promise.all([getStock(clinicId, tx), getH1Register(clinicId, undefined, tx)]),
  );

  return (
    <InventoryBoard
      stock={stock}
      h1={h1}
      formulary={stock.map((s) => ({ id: s.id, name: s.name, unit: s.unit }))}
      today={clinicToday()}
    />
  );
}
