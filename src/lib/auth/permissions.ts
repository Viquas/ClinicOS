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

/**
 * The refusal a screen shows when a role can't do something (§7.8).
 *
 * Named after what the person was trying to do and who CAN do it — "Front
 * desk can't dispense — ask someone with pharmacy access" is actionable at
 * a busy counter in a way a bare "forbidden" never is. Pure so the matrix
 * is unit-testable; the request-scoped wrapper lives in lib/auth/guard.ts.
 */
const REQUIREMENT: Record<Permission, { verb: string; holder: string }> = {
  "patient:register": { verb: "register patients or issue tokens", holder: "someone with front-desk access" },
  "patient:merge": { verb: "merge patient records", holder: "someone with front-desk access" },
  "vitals:record": { verb: "record vitals", holder: "someone with nursing or front-desk access" },
  "consultation:write": { verb: "write consultations", holder: "a doctor" },
  "prescription:write": { verb: "prescribe", holder: "a doctor" },
  "prescription:dispense": { verb: "dispense", holder: "someone with pharmacy access" },
  "inventory:purchase": { verb: "record stock purchases", holder: "someone with pharmacy access" },
  "inventory:adjust": { verb: "adjust stock", holder: "someone with pharmacy access" },
  "bill:create": { verb: "record bills", holder: "someone with billing access" },
  "bill:discount": { verb: "apply discounts", holder: "the owner" },
  "bill:refund": { verb: "record refunds", holder: "the owner" },
  "reports:revenue": { verb: "view revenue reports", holder: "the owner or a doctor" },
  "staff:manage": { verb: "manage staff", holder: "the owner" },
  "settings:manage": { verb: "change settings", holder: "the owner" },
  "mr:manage": { verb: "manage rep visits", holder: "front desk or a doctor" },
  "procedure:execute": { verb: "run procedures", holder: "someone with nursing access" },
};

export function refusalFor(
  name: string,
  roles: StaffRole[],
  permission: Permission,
): string | null {
  if (can(roles, permission)) return null;
  const { verb, holder } = REQUIREMENT[permission];
  return `${name} can't ${verb} — ask ${holder}.`;
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
