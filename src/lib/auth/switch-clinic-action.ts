"use server";

import { and, asc, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { staff } from "@/db/schema";
import { ACTIVE_CLINIC_COOKIE } from "./current-clinic";
import { CURRENT_STAFF_COOKIE } from "./current-staff";

/**
 * Move this device into another clinic (§7.12).
 *
 * The staff cookie MUST move with it. Identity is per-clinic — staff rows
 * belong to one clinic — so carrying the old staff id across would resolve
 * nobody in the new clinic, and getCurrentStaff() would fall back to an
 * arbitrary owner there rather than anyone the user chose. Landing on an
 * active owner is both predictable and the role most likely to have
 * something to do on arrival.
 */
export async function switchClinicAction(clinicId: string) {
  const candidates = await db
    .select({ id: staff.id, roles: staff.roles })
    .from(staff)
    .where(
      and(
        eq(staff.clinicId, clinicId),
        eq(staff.isActive, true),
        isNull(staff.archivedAt),
      ),
    )
    .orderBy(asc(staff.createdAt));

  const landing =
    candidates.find((c) => (c.roles ?? []).includes("owner")) ?? candidates[0];

  if (!landing) {
    return { ok: false as const, error: "That clinic has no active staff" };
  }

  const cookieStore = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
  cookieStore.set(ACTIVE_CLINIC_COOKIE, clinicId, options);
  cookieStore.set(CURRENT_STAFF_COOKIE, landing.id, options);

  redirect("/home");
}
