import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "./index";
import { clinics, patients } from "./schema";
import { withClaims } from "./with-claims";

const CLINIC_A = "11111111-1111-1111-1111-111111111111";
const CLINIC_B = "88888888-0000-0000-0000-000000000002";
const OWNER_A = "22222222-0000-0000-0000-000000000001";

const claimsA = {
  clinicId: CLINIC_A,
  staffId: OWNER_A,
  staffRoles: ["owner"],
};

let clinicBPatientId: string;

beforeAll(async () => {
  await db
    .insert(clinics)
    .values({ id: CLINIC_B, name: "Rival Clinic" })
    .onConflictDoNothing();

  const [row] = await db
    .insert(patients)
    .values({
      clinicId: CLINIC_B,
      name: "Rival Clinic Patient",
      phone: "9000000001",
      sex: "male",
    })
    .returning({ id: patients.id });
  clinicBPatientId = row.id;
});

afterAll(async () => {
  await db.delete(patients).where(eq(patients.clinicId, CLINIC_B));
  await db.delete(clinics).where(eq(clinics.id, CLINIC_B));
});

describe("the bypass this exists to close", () => {
  it("the plain connection sees every clinic's patients", async () => {
    /* Not an aspiration — a statement of what the app does today. The app
       connects as the table owner, which bypasses RLS unconditionally, so
       nothing below the query layer prevents a cross-tenant read. */
    const all = await db.select({ id: patients.id }).from(patients);
    const ids = all.map((p) => p.id);

    expect(ids).toContain(clinicBPatientId);
  });

  it("withClaims hides another clinic's patients even with no filter", async () => {
    /* The whole point: an UNFILTERED select. Under RLS it must still be
       impossible to see clinic B. If this ever returns clinic B's patient,
       tenant isolation is broken regardless of what the query layer does. */
    const visible = await withClaims(claimsA, async (tx) => {
      const rows = await tx.select({ id: patients.id }).from(patients);
      return rows.map((r) => r.id);
    });

    expect(visible).not.toContain(clinicBPatientId);
    expect(visible.length).toBeGreaterThan(0);
  });

  it("cannot read a foreign patient even when naming its id directly", async () => {
    const rows = await withClaims(claimsA, async (tx) =>
      tx.select({ id: patients.id }).from(patients).where(eq(patients.id, clinicBPatientId)),
    );
    expect(rows).toHaveLength(0);
  });
});

describe("the three conditions RLS needs", () => {
  it("runs as a role without BYPASSRLS", async () => {
    const result = await withClaims(claimsA, async (tx) => {
      const rows = await tx.execute(
        sql`select current_user::text as who, (select rolbypassrls from pg_roles where rolname = current_user) as bypasses`,
      );
      return rows[0] as { who: string; bypasses: boolean };
    });

    expect(result.who).toBe("authenticated");
    expect(result.bypasses).toBe(false);
  });

  it("carries the claims on the same connection as the query", async () => {
    /* A pooled client would set the claim on one connection and run the
       query on another, leaving this empty — the failure mode the
       transaction exists to prevent. */
    const clinicId = await withClaims(claimsA, async (tx) => {
      const rows = await tx.execute(sql`select public.current_clinic_id() as id`);
      return (rows[0] as { id: string | null }).id;
    });

    expect(clinicId).toBe(CLINIC_A);
  });

  it("exposes the caller's roles to the policies", async () => {
    const isOwner = await withClaims(claimsA, async (tx) => {
      const rows = await tx.execute(sql`select public.has_role('owner') as ok`);
      return (rows[0] as { ok: boolean }).ok;
    });

    expect(isOwner).toBe(true);
  });
});

describe("connection hygiene", () => {
  it("reverts the role after the transaction", async () => {
    /* SET LOCAL, not SET: a pooled connection must never be handed on still
       wearing the last caller's identity. */
    await withClaims(claimsA, async (tx) => tx.execute(sql`select 1`));

    const rows = await db.execute(sql`select current_user::text as who`);
    expect((rows[0] as { who: string }).who).not.toBe("authenticated");
  });

  it("reverts the claims after the transaction", async () => {
    await withClaims(claimsA, async (tx) => tx.execute(sql`select 1`));

    const rows = await db.execute(
      sql`select current_setting('request.jwt.claims', true) as claims`,
    );
    const claims = (rows[0] as { claims: string | null }).claims;
    expect(claims === null || claims === "").toBe(true);
  });

  it("scopes claims per call rather than leaking between them", async () => {
    const first = await withClaims(claimsA, async (tx) => {
      const rows = await tx.execute(sql`select public.current_clinic_id() as id`);
      return (rows[0] as { id: string }).id;
    });
    const second = await withClaims(
      { clinicId: CLINIC_B, staffId: OWNER_A, staffRoles: ["owner"] },
      async (tx) => {
        const rows = await tx.execute(sql`select public.current_clinic_id() as id`);
        return (rows[0] as { id: string }).id;
      },
    );

    expect(first).toBe(CLINIC_A);
    expect(second).toBe(CLINIC_B);
  });
});
