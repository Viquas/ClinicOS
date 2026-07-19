import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clinics } from "@/db/schema";

export type ClinicProfile = {
  id: string;
  name: string;
  addressLine: string | null;
  city: string | null;
  pincode: string | null;
  phone: string | null;
  ceaRegistrationNo: string | null;
  gstin: string | null;
  isGstRegistered: boolean;
  primarySpecialty: string | null;
  /* Two-letter monogram for the nav avatar. */
  initials: string;
};

/**
 * The clinic's own identity (§7.12).
 *
 * The nav header and Settings both used to print "Vatsalya Child Care" from
 * lib/mock/data regardless of which clinic was open — so a clinic created by
 * onboarding was correct in the database and mislabelled everywhere on
 * screen.
 */
export async function getClinicProfile(
  clinicId: string,
): Promise<ClinicProfile | null> {
  const [row] = await db.select().from(clinics).where(eq(clinics.id, clinicId));
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    addressLine: row.addressLine,
    city: row.city,
    pincode: row.pincode,
    phone: row.phone,
    ceaRegistrationNo: row.ceaRegistrationNo,
    gstin: row.gstin,
    isGstRegistered: row.isGstRegistered,
    primarySpecialty: row.primarySpecialty,
    initials: initialsOf(row.name),
  };
}

function initialsOf(name: string): string {
  const words = name
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "CL";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
