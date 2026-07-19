import type { StaffRole } from "./claims";

/**
 * Role-based permissions — PRD §7.8.
 *
 * This table drives UI affordances and server-action guards. It is not the
 * security boundary; RLS is. Anything here that would be catastrophic if
 * bypassed also has a corresponding database policy, and the two are meant to
 * be read side by side.
 */

export const PERMISSIONS = [
  "patient:register",
  "patient:merge",
  "vitals:record",
  "consultation:write",
  "prescription:write",
  "prescription:dispense",
  "inventory:purchase",
  "inventory:adjust",
  "bill:create",
  "bill:discount",
  "bill:refund",
  "reports:revenue",
  "staff:manage",
  "settings:manage",
  "mr:manage",
  "procedure:execute",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Owner is deliberately absent: it is handled as a wildcard in `can()` rather
 * than listed against every permission, so adding a permission never risks
 * silently locking the owner out of their own clinic.
 */
const ROLE_PERMISSIONS: Record<Exclude<StaffRole, "owner">, Permission[]> = {
  doctor: [
    "patient:register",
    "vitals:record",
    "consultation:write",
    "prescription:write",
    "procedure:execute",
    "mr:manage",
    "reports:revenue",
  ],

  front_desk: [
    "patient:register",
    "patient:merge",
    "vitals:record",
    "bill:create",
    "mr:manage",
    // No reports:revenue — front desk sees today's collection for their own
    // cash closing, but not clinic revenue reporting (§7.8).
  ],

  nurse: ["vitals:record", "procedure:execute"],

  pharmacy: [
    "prescription:dispense",
    "inventory:purchase",
    "inventory:adjust",
    "bill:create",
    // Explicitly no prescription:write — mirrored by a RESTRICTIVE policy on
    // public.prescriptions, so this holds even if a server action forgets it.
  ],
};

export function can(roles: StaffRole[], permission: Permission): boolean {
  if (roles.includes("owner")) return true;

  return roles.some(
    (role) =>
      role !== "owner" && ROLE_PERMISSIONS[role]?.includes(permission),
  );
}

export function permissionsFor(roles: StaffRole[]): Permission[] {
  return PERMISSIONS.filter((p) => can(roles, p));
}

export class PermissionError extends Error {
  constructor(readonly permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "PermissionError";
  }
}

export function assertCan(roles: StaffRole[], permission: Permission): void {
  if (!can(roles, permission)) {
    throw new PermissionError(permission);
  }
}
