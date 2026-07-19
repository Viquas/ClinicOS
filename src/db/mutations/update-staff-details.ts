import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, doctors, recordRevisions, staff } from "@/db/schema";
import type { StaffRole } from "@/lib/auth/claims";
import { SPECIALTY_REGISTRY } from "@/lib/clinical/specialties";

export type StaffDetailEdits = {
  name?: string;
  phone?: string;
  qualification?: string | null;
  /* Doctor-only. Ignored (not an error) for non-doctors, so one form can
     serve both without the caller branching. */
  specialty?: string;
  registrationNo?: string | null;
  registrationCouncil?: string | null;
};

export type UpdateStaffDetailsResult = { ok: true } | { ok: false; error: string };

/**
 * Full profile editing for staff and doctors (§7.8, §9.2).
 *
 * This exists because the registration number was a dead end: Settings has
 * always warned that a doctor without one cannot issue prescriptions and told
 * the owner to "add it to unblock", while offering nowhere to add it. The
 * only way to make Dr. Anand prescribe was a manual UPDATE against the
 * database.
 *
 * Registration details are legal identity, not preferences — §9.2 makes every
 * prescription depend on them — so changes carry the same reason-required,
 * revision-logged treatment as a patient correction rather than saving
 * silently.
 *
 * Who may edit: the owner, for anyone; and anyone, for their own profile. A
 * doctor entering their own council registration is the normal path and
 * should not require the owner. Roles are deliberately NOT editable here —
 * that stays owner-only in manage-staff.ts, so self-editing can never become
 * self-promotion.
 */
export async function updateStaffDetails({
  clinicId,
  staffId,
  actorStaffId,
  actorRoles,
  reason,
  edits,
}: {
  clinicId: string;
  staffId: string;
  actorStaffId: string;
  actorRoles: StaffRole[];
  reason: string;
  edits: StaffDetailEdits;
}): Promise<UpdateStaffDetailsResult> {
  const isOwner = actorRoles.includes("owner");
  const isSelf = actorStaffId === staffId;
  if (!isOwner && !isSelf) {
    return { ok: false, error: "You can only edit your own profile" };
  }

  const trimmedReason = reason.trim();
  if (trimmedReason.length < 4) {
    return { ok: false, error: "A reason is required" };
  }

  const name = edits.name?.trim();
  if (name !== undefined && name.length < 2) {
    return { ok: false, error: "Enter the staff member's name" };
  }

  const phone = edits.phone?.replace(/\D/g, "");
  if (phone !== undefined && phone.length !== 10) {
    return { ok: false, error: "Enter a 10-digit phone number" };
  }

  if (edits.specialty !== undefined && !(edits.specialty in SPECIALTY_REGISTRY)) {
    return { ok: false, error: "Pick a specialty from the list" };
  }

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        name: staff.name,
        phone: staff.phone,
        qualification: staff.qualification,
        roles: staff.roles,
        isActive: staff.isActive,
      })
      .from(staff)
      .where(
        and(
          eq(staff.clinicId, clinicId),
          eq(staff.id, staffId),
          isNull(staff.archivedAt),
        ),
      )
      .for("update");

    if (!current) return { ok: false as const, error: "Staff member not found" };
    if (!current.isActive) {
      return { ok: false as const, error: "Reactivate them before editing details" };
    }

    const [currentDoctor] = await tx
      .select({
        id: doctors.id,
        specialty: doctors.specialty,
        registrationNo: doctors.registrationNo,
        registrationCouncil: doctors.registrationCouncil,
      })
      .from(doctors)
      .where(and(eq(doctors.clinicId, clinicId), eq(doctors.staffId, staffId)));

    /* Only the fields that actually changed land in the revision, so the
       trail reads as "what was corrected" rather than a full snapshot. */
    const previous: Record<string, unknown> = {};
    const staffPatch: Record<string, unknown> = {};
    const doctorPatch: Record<string, unknown> = {};

    if (name !== undefined && name !== current.name) {
      previous.name = current.name;
      staffPatch.name = name;
    }
    if (phone !== undefined && phone !== current.phone) {
      previous.phone = current.phone;
      staffPatch.phone = phone;
    }
    if (edits.qualification !== undefined) {
      const next = edits.qualification?.trim() || null;
      if (next !== current.qualification) {
        previous.qualification = current.qualification;
        staffPatch.qualification = next;
      }
    }

    if (currentDoctor) {
      if (edits.specialty !== undefined && edits.specialty !== currentDoctor.specialty) {
        previous.specialty = currentDoctor.specialty;
        doctorPatch.specialty = edits.specialty;
      }
      if (edits.registrationNo !== undefined) {
        const next = edits.registrationNo?.trim() || null;
        if (next !== currentDoctor.registrationNo) {
          previous.registrationNo = currentDoctor.registrationNo;
          doctorPatch.registrationNo = next;
        }
      }
      if (edits.registrationCouncil !== undefined) {
        const next = edits.registrationCouncil?.trim() || null;
        if (next !== currentDoctor.registrationCouncil) {
          previous.registrationCouncil = currentDoctor.registrationCouncil;
          doctorPatch.registrationCouncil = next;
        }
      }
    }

    if (Object.keys(previous).length === 0) {
      return { ok: false as const, error: "No changes to save" };
    }

    if (Object.keys(staffPatch).length > 0) {
      await tx
        .update(staff)
        .set({ ...staffPatch, updatedAt: new Date() })
        .where(eq(staff.id, staffId));
    }
    if (Object.keys(doctorPatch).length > 0 && currentDoctor) {
      await tx
        .update(doctors)
        .set({ ...doctorPatch, updatedAt: new Date() })
        .where(eq(doctors.id, currentDoctor.id));
    }

    await tx.insert(recordRevisions).values({
      clinicId,
      entityTable: "staff",
      entityId: staffId,
      previousValues: previous,
      reason: trimmedReason,
      editedByStaffId: actorStaffId,
    });

    await tx.insert(auditLog).values({
      clinicId,
      actorStaffId,
      action: "staff_details_updated",
      entityTable: "staff",
      entityId: staffId,
      detail: { changed: Object.keys(previous), reason: trimmedReason },
    });

    return { ok: true as const };
  });
}
