import "server-only";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "./current-staff";
import { roleCanVisit } from "./route-roles";
import type { StaffIdentity } from "@/db/queries/staff";

/**
 * Page-read gate for nav destinations (§7.8 P1 polish). A direct URL to a
 * screen outside the signed-in roles redirects to /home with a notice
 * instead of rendering a screen whose every action would refuse anyway.
 *
 * Returns the identity so pages that need it don't resolve it twice.
 */
export async function requireRouteAccess(
  clinicId: string,
  route: string,
): Promise<StaffIdentity> {
  const staff = await getCurrentStaff(clinicId);
  if (!roleCanVisit(staff.roles, route)) {
    redirect(`/home?denied=${encodeURIComponent(route.slice(1))}`);
  }
  return staff;
}
