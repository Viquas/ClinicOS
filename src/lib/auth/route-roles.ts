import type { StaffRole } from "./claims";

/**
 * Which roles each nav destination serves (§7.8) — the ONE map both the nav
 * (client, hides the item) and the page guards (server, redirects a direct
 * URL) read. Two copies of this list drifted apart is exactly the bug class
 * enforcement exists to prevent, so there is only this copy.
 *
 * Owner is implicit everywhere and deliberately absent, mirroring
 * permissions.ts — adding a route can never lock the owner out.
 *
 * This gates page READS as wayfinding polish; mutations carry their own
 * requireCurrentStaffCan() checks, which are the real gate.
 */
export const ROUTE_ROLES: Record<string, StaffRole[]> = {
  "/home": ["doctor", "front_desk", "nurse", "pharmacy"],
  "/reception": ["front_desk"],
  "/queue": ["doctor", "front_desk", "nurse"],
  "/patients": ["doctor", "front_desk", "nurse"],
  "/tasks": ["doctor", "nurse"],
  "/vaccinations": ["doctor", "nurse"],
  "/pharmacy": ["pharmacy"],
  "/inventory": ["pharmacy"],
  "/billing": ["front_desk"],
  "/mr": ["doctor", "front_desk"],
  "/messages": ["front_desk"],
  "/dashboard": [],
  "/settings": ["doctor", "front_desk", "nurse", "pharmacy"],
};

export function roleCanVisit(roles: StaffRole[], route: string): boolean {
  if (roles.includes("owner")) return true;
  const allowed = ROUTE_ROLES[route];
  if (!allowed) return true;
  return allowed.some((r) => roles.includes(r));
}
