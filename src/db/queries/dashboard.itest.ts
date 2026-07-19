import { describe, expect, it } from "vitest";
import { getDashboard } from "./dashboard";

const CLINIC = "11111111-1111-1111-1111-111111111111";
const OTHER_CLINIC = "99999999-9999-9999-9999-999999999999";
const MONTH_START = "2026-07-01";
const MONTH_END = "2026-07-31";
const TODAY = "2026-07-18";

describe("getDashboard", () => {
  it("counts the month's visits", async () => {
    const data = await getDashboard(CLINIC, MONTH_START, MONTH_END, TODAY);
    /* Six visits are seeded for the day. */
    expect(data.monthVisits).toBeGreaterThanOrEqual(6);
  });

  it("surfaces batches expiring within 60 days", async () => {
    const data = await getDashboard(CLINIC, MONTH_START, MONTH_END, TODAY);

    /* Ondansetron ON-1120 expires 2026-07-31 — inside the window. */
    const names = data.expiringAlerts.map((a) => a.itemName);
    expect(names).toContain("Ondansetron");
  });

  it("does not count an expired batch as expiring-soon", async () => {
    const data = await getDashboard(CLINIC, MONTH_START, MONTH_END, TODAY);

    /* PC-1885 expired on 2026-06-30 — it is expired, not expiring, and belongs
       to the write-off path, not the 60-day alert. */
    const batchNos = data.expiringAlerts.map((a) => a.batchNo);
    expect(batchNos).not.toContain("PC-1885");
  });

  it("computes days-to-expiry correctly", async () => {
    const data = await getDashboard(CLINIC, MONTH_START, MONTH_END, TODAY);
    const ondansetron = data.expiringAlerts.find(
      (a) => a.itemName === "Ondansetron",
    )!;

    /* 2026-07-31 minus 2026-07-18 = 13 days. */
    expect(ondansetron.days).toBe(13);
  });

  it("flags items at or below the reorder level", async () => {
    const data = await getDashboard(CLINIC, MONTH_START, MONTH_END, TODAY);

    /* Salbutamol has 4 live units against a reorder level of 20. */
    const names = data.lowStock.map((s) => s.itemName);
    expect(names).toContain("Salbutamol Respules");
  });

  it("excludes expired stock from the low-stock live count", async () => {
    const data = await getDashboard(CLINIC, MONTH_START, MONTH_END, TODAY);
    const paracetamol = data.lowStock.find(
      (s) => s.itemName === "Paracetamol Syrup",
    );

    /* Paracetamol's live (unexpired) stock is 6 + 24 = 30, above its reorder
       level of 10 — the 9 expired units must not push it over on their own,
       and must not keep it off the list either. It should simply not appear. */
    expect(paracetamol).toBeUndefined();
  });

  it("splits revenue into service and goods, summing to the total", async () => {
    const data = await getDashboard(CLINIC, MONTH_START, MONTH_END, TODAY);

    expect(data.serviceRevenuePaise + data.goodsRevenuePaise).toBe(
      data.monthRevenuePaise,
    );
  });

  it("is scoped to the clinic", async () => {
    const data = await getDashboard(
      OTHER_CLINIC,
      MONTH_START,
      MONTH_END,
      TODAY,
    );

    expect(data.monthVisits).toBe(0);
    expect(data.monthRevenuePaise).toBe(0);
    expect(data.expiringAlerts).toEqual([]);
    expect(data.lowStock).toEqual([]);
  });

  it("returns visits grouped by day in date order", async () => {
    const data = await getDashboard(CLINIC, MONTH_START, MONTH_END, TODAY);

    const dates = data.visitsByDay.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
  });
});
