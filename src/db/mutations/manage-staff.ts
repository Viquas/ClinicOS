import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, doctors, recordRevisions, staff } from "@/db/schema";
import type { StaffRole } from "@/lib/auth/claims";
import { SPECIALTY_REGISTRY } from "@/lib/clinical/specialties";

export type ManageStaffResult = { ok: true } | { ok: false; error: string };

/**
 * Staff and role administration (§7.8, §7.12) — the owner deciding who holds
 * what. Role stacking stays first-class: granting a nurse the pharmacy role
 * is exactly how a two-person clinic runs dispensing, and it is one array
 * update here, not a second login.
 *
 * The invariants live INSIDE the transactions, not in the UI:
 *
 *  · A clinic must always keep at least one active owner. Concurrent
 *    demotions/deactivations of two owners are serialized by locking every
 *    active staff row first — without that, both transactions count "one
 *    other owner remaining" and both proceed to zero.
 *  · A staff member must hold at least one role; deactivation is the
 *    "no access" state, an empty roles array is just confusing.
 *  · Granting the doctor role creates the doctors row (specialty required —
 *    it drives the template pack), because a doctor with no specialty has no
 *    vitals fields, no favourites, and no queue. Revoking it deletes
 *    nothing: history keeps joining through the existing row.
 *
 * Every change writes a record_revisions row (pre-edit values) and an audit
 * entry in the same transaction — the same discipline as patient edits.
 */

function assertOwnerActor(actorRoles: StaffRole[]): string | null {
  return actorRoles.includes("owner")
    ? null
    : "Only the owner can manage staff";
}

/** Locks every active staff row and returns them — the serialization point
    for any change that could remove the clinic's last active owner. */
async function lockActiveStaff(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  clinicId: string,
) {
  return tx
    .select({ id: staff.id, roles: staff.roles })
    .from(staff)
    .where(
      and(
        eq(staff.clinicId, clinicId),
        eq(staff.isActive, true),
        isNull(staff.archivedAt),
      ),
    )
    .for("update");
}

export async function updateStaffRoles({
  clinicId,
  staffId,
  actorStaffId,
  actorRoles,
  reason,
  roles,
  specialty,
}: {
  clinicId: string;
  staffId: string;
  actorStaffId: string;
  actorRoles: StaffRole[];
  reason: string;
  roles: StaffRole[];
  /** Required when granting the doctor role to someone without a doctors row. */
  specialty?: string;
}): Promise<ManageStaffResult> {
  const ownerRefusal = assertOwnerActor(actorRoles);
  if (ownerRefusal) return { ok: false, error: ownerRefusal };

  const trimmedReason = reason.trim();
  if (trimmedReason.length < 4) {
    return { ok: false, error: "A reason is required to change roles" };
  }
  if (roles.length === 0) {
    return {
      ok: false,
      error: "A staff member needs at least one role — deactivate them instead",
    };
  }

  return db.transaction(async (tx) => {
    const activeStaff = await lockActiveStaff(tx, clinicId);
    const target = activeStaff.find((s) => s.id === staffId);

    /* Role edits are for active staff; an inactive person's roles are moot
       until reactivation. Also catches ids from another clinic. */
    if (!target) {
      return { ok: false as const, error: "Staff member not found or inactive" };
    }

    const currentRoles = (target.roles ?? []) as StaffRole[];
    const changed =
      [...currentRoles].sort().join(",") !== [...roles].sort().join(",");
    if (!changed) {
      return { ok: false as const, error: "No changes to save" };
    }

    const removingOwner =
      currentRoles.includes("owner") && !roles.includes("owner");
    if (removingOwner) {
      const otherOwners = activeStaff.filter(
        (s) => s.id !== staffId && (s.roles ?? []).includes("owner"),
      );
      if (otherOwners.length === 0) {
        return {
          ok: false as const,
          error: "The clinic needs at least one active owner",
        };
      }
    }

    const grantingDoctor =
      !currentRoles.includes("doctor") && roles.includes("doctor");
    if (grantingDoctor) {
      const [existingDoctor] = await tx
        .select({ id: doctors.id })
        .from(doctors)
        .where(and(eq(doctors.clinicId, clinicId), eq(doctors.staffId, staffId)));

      if (!existingDoctor) {
        if (!specialty || !(specialty in SPECIALTY_REGISTRY)) {
          return {
            ok: false as const,
            error: "Granting the doctor role needs a specialty",
          };
        }
        /* No registrationNo yet — prescribing stays blocked until the owner
           adds it (§9.2), exactly the Dr. Anand state. */
        await tx.insert(doctors).values({ clinicId, staffId, specialty });
      }
    }

    await tx
      .update(staff)
      .set({ roles, updatedAt: new Date() })
      .where(eq(staff.id, staffId));

    await tx.insert(recordRevisions).values({
      clinicId,
      entityTable: "staff",
      entityId: staffId,
      previousValues: { roles: currentRoles },
      reason: trimmedReason,
      editedByStaffId: actorStaffId,
    });

    await tx.insert(auditLog).values({
      clinicId,
      actorStaffId,
      action: "staff_roles_changed",
      entityTable: "staff",
      entityId: staffId,
      detail: { from: currentRoles, to: roles, reason: trimmedReason },
    });

    return { ok: true as const };
  });
}

export type AddStaffResult =
  | { ok: true; staffId: string }
  | { ok: false; error: string };

export async function addStaff({
  clinicId,
  actorStaffId,
  actorRoles,
  name,
  phone,
  roles,
  qualification,
  specialty,
}: {
  clinicId: string;
  actorStaffId: string;
  actorRoles: StaffRole[];
  name: string;
  phone: string;
  roles: StaffRole[];
  qualification?: string | null;
  specialty?: string;
}): Promise<AddStaffResult> {
  const ownerRefusal = assertOwnerActor(actorRoles);
  if (ownerRefusal) return { ok: false, error: ownerRefusal };

  const trimmedName = name.trim();
  const digits = phone.replace(/\D/g, "");
  if (trimmedName.length < 2) {
    return { ok: false, error: "Enter the staff member's name" };
  }
  if (digits.length !== 10) {
    return { ok: false, error: "Enter a 10-digit phone number" };
  }
  if (roles.length === 0) {
    return { ok: false, error: "Pick at least one role" };
  }
  if (roles.includes("doctor") && (!specialty || !(specialty in SPECIALTY_REGISTRY))) {
    return { ok: false, error: "A doctor needs a specialty" };
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(staff)
      .values({
        clinicId,
        name: trimmedName,
        phone: digits,
        roles,
        qualification: qualification?.trim() || null,
      })
      .returning({ id: staff.id });

    if (roles.includes("doctor")) {
      await tx
        .insert(doctors)
        .values({ clinicId, staffId: row.id, specialty: specialty! });
    }

    await tx.insert(auditLog).values({
      clinicId,
      actorStaffId,
      action: "staff_added",
      entityTable: "staff",
      entityId: row.id,
      detail: { name: trimmedName, roles },
    });

    return { ok: true as const, staffId: row.id };
  });
}

export async function setStaffActive({
  clinicId,
  staffId,
  actorStaffId,
  actorRoles,
  active,
  reason,
}: {
  clinicId: string;
  staffId: string;
  actorStaffId: string;
  actorRoles: StaffRole[];
  active: boolean;
  reason: string;
}): Promise<ManageStaffResult> {
  const ownerRefusal = assertOwnerActor(actorRoles);
  if (ownerRefusal) return { ok: false, error: ownerRefusal };

  const trimmedReason = reason.trim();
  if (trimmedReason.length < 4) {
    return { ok: false, error: "A reason is required" };
  }
  /* Locking yourself out mid-shift is never the intent; another owner can
     do it if it ever genuinely is. */
  if (!active && staffId === actorStaffId) {
    return { ok: false, error: "You can't deactivate yourself" };
  }

  return db.transaction(async (tx) => {
    const activeStaff = await lockActiveStaff(tx, clinicId);

    const [target] = await tx
      .select({ isActive: staff.isActive, roles: staff.roles })
      .from(staff)
      .where(
        and(
          eq(staff.clinicId, clinicId),
          eq(staff.id, staffId),
          isNull(staff.archivedAt),
        ),
      )
      .for("update");

    if (!target) {
      return { ok: false as const, error: "Staff member not found" };
    }
    if (target.isActive === active) {
      return { ok: false as const, error: "No changes to save" };
    }

    if (!active && (target.roles ?? []).includes("owner")) {
      const otherOwners = activeStaff.filter(
        (s) => s.id !== staffId && (s.roles ?? []).includes("owner"),
      );
      if (otherOwners.length === 0) {
        return {
          ok: false as const,
          error: "The clinic needs at least one active owner",
        };
      }
    }

    await tx
      .update(staff)
      .set({ isActive: active, updatedAt: new Date() })
      .where(eq(staff.id, staffId));

    await tx.insert(recordRevisions).values({
      clinicId,
      entityTable: "staff",
      entityId: staffId,
      previousValues: { isActive: target.isActive },
      reason: trimmedReason,
      editedByStaffId: actorStaffId,
    });

    await tx.insert(auditLog).values({
      clinicId,
      actorStaffId,
      action: active ? "staff_reactivated" : "staff_deactivated",
      entityTable: "staff",
      entityId: staffId,
      detail: { reason: trimmedReason },
    });

    return { ok: true as const };
  });
}
