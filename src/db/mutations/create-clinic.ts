import "server-only";
import { db } from "@/db";
import { auditLog, clinics, doctors, staff } from "@/db/schema";
import { SPECIALTY_REGISTRY } from "@/lib/clinical/specialties";

export type CreateClinicResult =
  | { ok: true; clinicId: string; ownerStaffId: string }
  | { ok: false; error: string };

/**
 * Onboarding (§7.12) — a clinic live in one pass.
 *
 * Creates the clinic, its owner, and (when the owner practises) their doctor
 * record in a single transaction. Partial success here is the worst outcome
 * available: a clinic row with no owner is unreachable forever, since the
 * owner is the only role that can add staff.
 *
 * The owner always holds front_desk alongside owner. A solo practitioner who
 * cannot register a patient on day one has an app that does nothing, and
 * §7.12's promise is a working clinic at the end of the wizard, not a
 * correctly-modelled empty one.
 *
 * primarySpecialty seeds the template pack for the whole clinic; the doctor's
 * own specialty is what actually drives their screens (§6 — differences are
 * data, never a code fork).
 */
export async function createClinic({
  name,
  phone,
  addressLine,
  city,
  pincode,
  ceaRegistrationNo,
  isGstRegistered,
  gstin,
  primarySpecialty,
  owner,
}: {
  name: string;
  phone?: string | null;
  addressLine?: string | null;
  city?: string | null;
  pincode?: string | null;
  ceaRegistrationNo?: string | null;
  isGstRegistered: boolean;
  gstin?: string | null;
  primarySpecialty: string;
  owner: {
    name: string;
    phone: string;
    qualification?: string | null;
    /* A non-practising owner (a manager) gets no doctor record. */
    isDoctor: boolean;
    registrationNo?: string | null;
    registrationCouncil?: string | null;
  };
}): Promise<CreateClinicResult> {
  const clinicName = name.trim();
  if (clinicName.length < 2) {
    return { ok: false, error: "Enter the clinic's name" };
  }
  if (!(primarySpecialty in SPECIALTY_REGISTRY)) {
    return { ok: false, error: "Pick a specialty from the list" };
  }

  const ownerName = owner.name.trim();
  const ownerPhone = owner.phone.replace(/\D/g, "");
  if (ownerName.length < 2) {
    return { ok: false, error: "Enter the owner's name" };
  }
  if (ownerPhone.length !== 10) {
    return { ok: false, error: "Enter a 10-digit phone number for the owner" };
  }
  if (isGstRegistered && !gstin?.trim()) {
    return { ok: false, error: "A GST-registered clinic needs a GSTIN" };
  }

  try {
    return await db.transaction(async (tx) => {
      const [clinic] = await tx
        .insert(clinics)
        .values({
          name: clinicName,
          phone: phone?.replace(/\D/g, "") || null,
          addressLine: addressLine?.trim() || null,
          city: city?.trim() || null,
          pincode: pincode?.replace(/\D/g, "") || null,
          ceaRegistrationNo: ceaRegistrationNo?.trim() || null,
          isGstRegistered,
          gstin: isGstRegistered ? gstin!.trim() : null,
          primarySpecialty,
        })
        .returning({ id: clinics.id });

      const [ownerStaff] = await tx
        .insert(staff)
        .values({
          clinicId: clinic.id,
          name: ownerName,
          phone: ownerPhone,
          qualification: owner.qualification?.trim() || null,
          /* front_desk alongside owner — see the note above. */
          roles: owner.isDoctor
            ? ["owner", "doctor", "front_desk"]
            : ["owner", "front_desk"],
        })
        .returning({ id: staff.id });

      if (owner.isDoctor) {
        await tx.insert(doctors).values({
          clinicId: clinic.id,
          staffId: ownerStaff.id,
          specialty: primarySpecialty,
          registrationNo: owner.registrationNo?.trim() || null,
          registrationCouncil: owner.registrationCouncil?.trim() || null,
        });
      }

      await tx.insert(auditLog).values({
        clinicId: clinic.id,
        actorStaffId: ownerStaff.id,
        action: "clinic_created",
        entityTable: "clinics",
        entityId: clinic.id,
        detail: { name: clinicName, primarySpecialty },
      });

      return {
        ok: true as const,
        clinicId: clinic.id,
        ownerStaffId: ownerStaff.id,
      };
    });
  } catch (error) {
    console.error("createClinic failed", error);
    return { ok: false, error: "Could not create the clinic" };
  }
}
