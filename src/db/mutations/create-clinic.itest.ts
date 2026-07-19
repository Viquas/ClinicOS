import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, clinics, doctors, staff } from "@/db/schema";
import { createClinic } from "./create-clinic";

const created: string[] = [];

async function make(overrides: Parameters<typeof createClinic>[0]) {
  const result = await createClinic(overrides);
  if (result.ok) created.push(result.clinicId);
  return result;
}

const base = {
  name: "Sunrise Family Clinic",
  phone: "0821 246 8800",
  addressLine: "12 MG Road",
  city: "Mysuru",
  pincode: "570001",
  ceaRegistrationNo: "KA/CEA/2026/55501",
  isGstRegistered: false,
  primarySpecialty: "general_medicine",
  owner: {
    name: "Dr. Meera Iyer",
    phone: "98450 11122",
    qualification: "MBBS, MD",
    isDoctor: true,
    registrationNo: "KMC 55501",
    registrationCouncil: "Karnataka Medical Council",
  },
};

afterEach(async () => {
  for (const id of created.splice(0)) {
    await db.delete(auditLog).where(eq(auditLog.clinicId, id));
    await db.delete(doctors).where(eq(doctors.clinicId, id));
    await db.delete(staff).where(eq(staff.clinicId, id));
    await db.delete(clinics).where(inArray(clinics.id, [id]));
  }
});

describe("createClinic", () => {
  it("creates the clinic with its profile", async () => {
    const result = await make(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [clinic] = await db
      .select()
      .from(clinics)
      .where(eq(clinics.id, result.clinicId));
    expect(clinic.name).toBe("Sunrise Family Clinic");
    expect(clinic.city).toBe("Mysuru");
    expect(clinic.primarySpecialty).toBe("general_medicine");
    /* Non-digits stripped, matching how staff phones normalise. */
    expect(clinic.phone).toBe("08212468800");
  });

  it("creates an owner who can also work the front desk", async () => {
    const result = await make(base);
    if (!result.ok) return;

    const [ownerRow] = await db
      .select({ name: staff.name, roles: staff.roles, isActive: staff.isActive })
      .from(staff)
      .where(eq(staff.id, result.ownerStaffId));

    expect(ownerRow.isActive).toBe(true);
    expect(ownerRow.roles).toContain("owner");
    /* Without front_desk a solo owner cannot register the first patient. */
    expect(ownerRow.roles).toContain("front_desk");
  });

  it("creates the doctor record with registration when the owner practises", async () => {
    const result = await make(base);
    if (!result.ok) return;

    const [doctorRow] = await db
      .select({
        specialty: doctors.specialty,
        reg: doctors.registrationNo,
        council: doctors.registrationCouncil,
      })
      .from(doctors)
      .where(eq(doctors.staffId, result.ownerStaffId));

    expect(doctorRow.specialty).toBe("general_medicine");
    expect(doctorRow.reg).toBe("KMC 55501");
    expect(doctorRow.council).toBe("Karnataka Medical Council");
  });

  it("creates no doctor record for a non-practising owner", async () => {
    const result = await make({
      ...base,
      owner: { name: "Ravi Manager", phone: "9845033344", isDoctor: false },
    });
    if (!result.ok) return;

    const rows = await db
      .select()
      .from(doctors)
      .where(eq(doctors.clinicId, result.clinicId));
    expect(rows).toHaveLength(0);

    const [ownerRow] = await db
      .select({ roles: staff.roles })
      .from(staff)
      .where(eq(staff.id, result.ownerStaffId));
    expect(ownerRow.roles).not.toContain("doctor");
  });

  it("allows a doctor owner with no registration yet, leaving prescribing blocked", async () => {
    /* §9.2: onboarding must not demand the certificate be to hand; the
       Settings banner then chases it. */
    const result = await make({
      ...base,
      owner: { ...base.owner, registrationNo: null, registrationCouncil: null },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [doctorRow] = await db
      .select({ reg: doctors.registrationNo })
      .from(doctors)
      .where(eq(doctors.staffId, result.ownerStaffId));
    expect(doctorRow.reg).toBeNull();
  });

  it("stores the GSTIN only when the clinic is registered", async () => {
    const result = await make({
      ...base,
      isGstRegistered: true,
      gstin: "29ABCDE1234F1Z5",
    });
    if (!result.ok) return;

    const [clinic] = await db
      .select({ gstin: clinics.gstin, reg: clinics.isGstRegistered })
      .from(clinics)
      .where(eq(clinics.id, result.clinicId));
    expect(clinic.reg).toBe(true);
    expect(clinic.gstin).toBe("29ABCDE1234F1Z5");
  });

  it("refuses a GST-registered clinic with no GSTIN", async () => {
    const result = await make({ ...base, isGstRegistered: true, gstin: "  " });
    expect(result.ok).toBe(false);
  });

  it("refuses an unknown specialty", async () => {
    expect((await make({ ...base, primarySpecialty: "astrology" })).ok).toBe(false);
  });

  it("refuses a bad owner phone", async () => {
    const result = await make({
      ...base,
      owner: { ...base.owner, phone: "12345" },
    });
    expect(result.ok).toBe(false);
  });

  it("refuses an empty clinic name", async () => {
    expect((await make({ ...base, name: " " })).ok).toBe(false);
  });

  it("writes nothing at all when validation fails", async () => {
    const before = await db.select({ id: clinics.id }).from(clinics);
    await make({ ...base, primarySpecialty: "astrology" });
    const after = await db.select({ id: clinics.id }).from(clinics);
    expect(after).toHaveLength(before.length);
  });

  it("logs the creation against the new owner", async () => {
    const result = await make(base);
    if (!result.ok) return;

    const [entry] = await db
      .select({ action: auditLog.action, actor: auditLog.actorStaffId })
      .from(auditLog)
      .where(eq(auditLog.clinicId, result.clinicId));
    expect(entry.action).toBe("clinic_created");
    expect(entry.actor).toBe(result.ownerStaffId);
  });

  it("keeps the new clinic isolated from the seeded one", async () => {
    const result = await make(base);
    if (!result.ok) return;

    const seededStaff = await db
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.clinicId, "11111111-1111-1111-1111-111111111111"));
    /* The seeded clinic still has exactly its four people. */
    expect(seededStaff).toHaveLength(4);
  });
});
