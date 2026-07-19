import { describe, expect, it } from "vitest";
import {
  assertCan,
  can,
  PermissionError,
  permissionsFor,
  PERMISSIONS,
} from "./permissions";

describe("owner", () => {
  it("holds every permission without being enumerated", () => {
    for (const permission of PERMISSIONS) {
      expect(can(["owner"], permission)).toBe(true);
    }
  });
});

describe("separation of duties (§7.8)", () => {
  it("denies pharmacy the ability to author a prescription", () => {
    expect(can(["pharmacy"], "prescription:write")).toBe(false);
  });

  it("denies front desk revenue reporting", () => {
    expect(can(["front_desk"], "reports:revenue")).toBe(false);
  });

  it("denies a nurse access to billing", () => {
    expect(can(["nurse"], "bill:create")).toBe(false);
  });

  it("reserves settings and staff management to the owner", () => {
    for (const role of ["doctor", "front_desk", "nurse", "pharmacy"] as const) {
      expect(can([role], "settings:manage")).toBe(false);
      expect(can([role], "staff:manage")).toBe(false);
    }
  });

  it("reserves discounts and refunds to the owner", () => {
    for (const role of ["doctor", "front_desk", "nurse", "pharmacy"] as const) {
      expect(can([role], "bill:discount")).toBe(false);
      expect(can([role], "bill:refund")).toBe(false);
    }
  });
});

describe("role stacking (§7.12)", () => {
  it("unions permissions across stacked roles", () => {
    const stacked = can(["front_desk", "pharmacy"], "prescription:dispense");
    expect(stacked).toBe(true);
  });

  it("does not grant a permission neither stacked role holds", () => {
    expect(can(["front_desk", "pharmacy"], "prescription:write")).toBe(false);
    expect(can(["front_desk", "nurse"], "settings:manage")).toBe(false);
  });

  it("lets a two-person clinic run the whole front of house on one login", () => {
    const solo = permissionsFor(["front_desk", "pharmacy", "nurse"]);

    expect(solo).toContain("patient:register");
    expect(solo).toContain("vitals:record");
    expect(solo).toContain("prescription:dispense");
    expect(solo).toContain("procedure:execute");
    expect(solo).toContain("bill:create");
  });
});

describe("empty roles", () => {
  it("grants nothing", () => {
    expect(permissionsFor([])).toEqual([]);
  });
});

describe("assertCan", () => {
  it("throws a PermissionError naming the missing permission", () => {
    expect(() => assertCan(["nurse"], "prescription:write")).toThrow(
      PermissionError,
    );

    try {
      assertCan(["nurse"], "prescription:write");
    } catch (error) {
      expect((error as PermissionError).permission).toBe("prescription:write");
    }
  });

  it("is silent when the permission is held", () => {
    expect(() => assertCan(["doctor"], "prescription:write")).not.toThrow();
  });
});
