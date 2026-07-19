import { describe, expect, it } from "vitest";
import { describeAudit } from "./describe";

describe("describeAudit", () => {
  it("describes a token issue", () => {
    const d = describeAudit("token_issued", {
      number: 12,
      patientName: "Aarav Prakash",
      isPriority: false,
    });
    expect(d.title).toBe("Token issued");
    expect(d.detail).toContain("Token 12");
    expect(d.detail).toContain("Aarav Prakash");
  });

  it("flags a priority token", () => {
    const d = describeAudit("token_issued", {
      number: 14,
      patientName: "Diya",
      isPriority: true,
    });
    expect(d.detail).toContain("priority");
  });

  it("describes a merge with the direction and visit count", () => {
    const d = describeAudit("patient_merged", {
      duplicateName: "Lakshmi D",
      survivorName: "Lakshmi Devi",
      movedVisits: 2,
    });
    expect(d.detail).toContain("Lakshmi D merged into Lakshmi Devi");
    expect(d.detail).toContain("2 visit(s) moved");
  });

  it("describes a dispense with batches and quantities", () => {
    const d = describeAudit("dispensed", {
      lines: [
        { batchNo: "PC-2291", quantity: 1 },
        { batchNo: "AM-8801", quantity: 1 },
      ],
    });
    expect(d.detail).toContain("PC-2291 ×1");
    expect(d.detail).toContain("AM-8801 ×1");
    expect(d.tone).toBe("warning");
  });

  it("formats bill money from paise", () => {
    const d = describeAudit("bill_recorded", { total: 43400, mode: "upi" });
    expect(d.detail).toContain("₹434.00");
    expect(d.detail).toContain("UPI");
  });

  it("describes a purchase", () => {
    const d = describeAudit("purchase_added", {
      batchNo: "SB-9001",
      quantity: 50,
      expiryDate: "2026-10-31",
    });
    expect(d.detail).toContain("SB-9001");
    expect(d.detail).toContain("50 units");
  });

  it("marks an allergy override as an alert", () => {
    const d = describeAudit("allergy_override", {
      drug: "Amoxicillin",
      reason: "prior reaction mild",
    });
    expect(d.tone).toBe("alert");
    expect(d.detail).toContain("Amoxicillin");
    expect(d.detail).toContain("prior reaction mild");
  });

  describe("robustness — the audit log must always render", () => {
    it("degrades an unknown action to its slug rather than throwing", () => {
      const d = describeAudit("some_future_action", { anything: true });
      expect(d.title).toBe("some future action");
      expect(d.detail).toBe("");
    });

    it("tolerates a null detail", () => {
      const d = describeAudit("token_issued", null);
      expect(d.title).toBe("Token issued");
      /* Missing fields fall back rather than printing "undefined". */
      expect(d.detail).not.toContain("undefined");
    });

    it("tolerates a detail of the wrong type", () => {
      expect(() => describeAudit("dispensed", "not an object")).not.toThrow();
      expect(() => describeAudit("bill_recorded", 42)).not.toThrow();
    });

    it("tolerates missing fields without printing 'undefined'", () => {
      const d = describeAudit("bill_recorded", {});
      expect(d.detail).not.toContain("undefined");
      expect(d.detail).not.toContain("NaN");
    });

    it("tolerates a dispense with a malformed lines array", () => {
      const d = describeAudit("dispensed", { lines: "oops" });
      expect(d.detail).toBe("medicines dispensed");
    });
  });
});
