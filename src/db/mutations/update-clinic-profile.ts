import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import type { Executor } from "@/db/tenant-db";
import { auditLog, clinics, recordRevisions } from "@/db/schema";
import type { StaffRole } from "@/lib/auth/claims";

export type ClinicProfileEdits = {
  name?: string;
  phone?: string | null;
  addressLine?: string | null;
  city?: string | null;
  pincode?: string | null;
  ceaRegistrationNo?: string | null;
  isGstRegistered?: boolean;
  gstin?: string | null;
};

export type UpdateClinicProfileResult = { ok: true } | { ok: false; error: string };

/**
 * Clinic profile corrections (§7.12, §9.4).
 *
 * Onboarding lets an owner skip everything but the clinic's name, on the
 * grounds that a wizard blocking on a GSTIN nobody has to hand is where
 * onboarding dies. That promise only holds if the skipped fields can be
 * filled in afterwards — otherwise "add it later in Settings" is the same
 * dead end the doctor registration number was.
 *
 * These fields print on prescriptions and bills and decide whether bills
 * carry a GST split, so changes are reason-required and revision-logged
 * rather than silent, matching how patient and staff corrections behave.
 *
 * Owner-only: this is the clinic's legal identity on every document it
 * issues, not a per-user preference.
 */
export async function updateClinicProfile({
  clinicId,
  actorStaffId,
  actorRoles,
  reason,
  edits,
  executor = db,
}: {
  clinicId: string;
  actorStaffId: string;
  actorRoles: StaffRole[];
  reason: string;
  edits: ClinicProfileEdits;
  /* Pass the tenant transaction to run under RLS; its own transaction
     then nests as a savepoint rather than taking a fresh connection. */
  executor?: Executor;
}): Promise<UpdateClinicProfileResult> {
  if (!actorRoles.includes("owner")) {
    return { ok: false, error: "Only the owner can change the clinic profile" };
  }

  const trimmedReason = reason.trim();
  if (trimmedReason.length < 4) {
    return { ok: false, error: "A reason is required" };
  }

  const name = edits.name?.trim();
  if (name !== undefined && name.length < 2) {
    return { ok: false, error: "Enter the clinic's name" };
  }

  return executor.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(clinics)
      .where(eq(clinics.id, clinicId))
      .for("update");

    if (!current) return { ok: false as const, error: "Clinic not found" };

    /* Resolve the GST pair together: turning registration on demands a
       GSTIN, turning it off clears the number rather than leaving a stale
       one to print on the next bill. */
    const nextGstRegistered =
      edits.isGstRegistered ?? current.isGstRegistered;
    let nextGstin = current.gstin;

    if (edits.gstin !== undefined) nextGstin = edits.gstin?.trim() || null;
    if (!nextGstRegistered) nextGstin = null;
    if (nextGstRegistered && !nextGstin) {
      return { ok: false as const, error: "A GST-registered clinic needs a GSTIN" };
    }

    const previous: Record<string, unknown> = {};
    const patch: Record<string, unknown> = {};

    const text = (
      key: "name" | "addressLine" | "city" | "ceaRegistrationNo",
      raw: string | null | undefined,
    ) => {
      if (raw === undefined) return;
      const next = raw?.trim() || null;
      if (next !== current[key]) {
        previous[key] = current[key];
        patch[key] = next;
      }
    };

    const digits = (key: "phone" | "pincode", raw: string | null | undefined) => {
      if (raw === undefined) return;
      const next = raw?.replace(/\D/g, "") || null;
      if (next !== current[key]) {
        previous[key] = current[key];
        patch[key] = next;
      }
    };

    if (name !== undefined) text("name", name);
    text("addressLine", edits.addressLine);
    text("city", edits.city);
    text("ceaRegistrationNo", edits.ceaRegistrationNo);
    digits("phone", edits.phone);
    digits("pincode", edits.pincode);

    if (nextGstRegistered !== current.isGstRegistered) {
      previous.isGstRegistered = current.isGstRegistered;
      patch.isGstRegistered = nextGstRegistered;
    }
    if (nextGstin !== current.gstin) {
      previous.gstin = current.gstin;
      patch.gstin = nextGstin;
    }

    if (Object.keys(previous).length === 0) {
      return { ok: false as const, error: "No changes to save" };
    }

    await tx
      .update(clinics)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(clinics.id, clinicId));

    await tx.insert(recordRevisions).values({
      clinicId,
      entityTable: "clinics",
      entityId: clinicId,
      previousValues: previous,
      reason: trimmedReason,
      editedByStaffId: actorStaffId,
    });

    await tx.insert(auditLog).values({
      clinicId,
      actorStaffId,
      action: "clinic_profile_updated",
      entityTable: "clinics",
      entityId: clinicId,
      detail: { changed: Object.keys(previous), reason: trimmedReason },
    });

    return { ok: true as const };
  });
}
