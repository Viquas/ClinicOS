import { getStock } from "@/db/queries/pharmacy";
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

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

export default async function InventoryPage() {
  await requireRouteAccess(CLINIC_ID, "/inventory");
  const [stock, h1] = await Promise.all([
    getStock(CLINIC_ID),
    getH1Register(CLINIC_ID),
  ]);

  return (
    <InventoryBoard
      stock={stock}
      h1={h1}
      formulary={stock.map((s) => ({ id: s.id, name: s.name, unit: s.unit }))}
    />
  );
}
