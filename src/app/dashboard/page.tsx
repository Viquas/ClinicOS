import { ScreenHeader } from "@/components/screen-header";
import { clinicToday, clinicMonthBounds, clinicMonthLabel } from "@/lib/clinic-date";
import { tenantDb } from "@/db/tenant-db";
import { getClinicProfile } from "@/db/queries/clinic";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { requireRouteAccess } from "@/lib/auth/route-access";
import { AlertBanner } from "@/components/ui/alert-banner";
import { GroupedList, Row, SectionLabel } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status";
import { GradientPanel, MiniBars, StatTile } from "@/components/ui/stat-tile";
import { getDashboard } from "@/db/queries/dashboard";
import { formatPaise } from "@/lib/billing/gst";
import { IndianRupee, Package, Printer, Stethoscope, Users } from "lucide-react";
import Link from "next/link";

/*
 * Always render against current clinic state. Without this, Next statically
 * optimises the page in production and serves stale data — an audit log or
 * queue frozen at build time, which for a live clinic is not just wrong but
 * unsafe. Any page reading mutable clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";


/**
 * Adaptive currency for the headline stats.
 *
 * Lakh notation only helps above ₹1L. A fixed "%.2fL" turned a real ₹434 bill
 * into "₹0.00L" — which reads as no revenue at all, the opposite of the truth.
 * Below a lakh the number is shown in full rupees with Indian grouping.
 */
function money(paise: number): { value: string; unit?: string } {
  const rupees = paise / 100;
  if (rupees >= 100_000) {
    return { value: `₹${(rupees / 100_000).toFixed(2)}`, unit: "L" };
  }
  return {
    value: `₹${Math.round(rupees).toLocaleString("en-IN")}`,
  };
}

export default async function DashboardPage() {
  const TODAY = clinicToday();
  const { start: MONTH_START, end: MONTH_END } = clinicMonthBounds();
  const clinicId = await getActiveClinicId();
  await requireRouteAccess(clinicId, "/dashboard");
  const [data, clinic] = await Promise.all([
    tenantDb((tx) => getDashboard(clinicId, MONTH_START, MONTH_END, TODAY, tx)),
    getClinicProfile(clinicId),
  ]);

  const alertCount = data.expiringAlerts.length + data.lowStock.length;
  const consultShare =
    data.monthRevenuePaise > 0
      ? Math.round((data.serviceRevenuePaise / data.monthRevenuePaise) * 100)
      : 0;
  const pharmacyShare = 100 - consultShare;

  const maxDay = Math.max(1, ...data.visitsByDay.map((d) => d.count));
  const collected = money(data.monthRevenuePaise);

  return (
    <>
      <ScreenHeader
        title="This month"
        subtitle={`${clinic?.name ?? "Your clinic"} · ${clinicMonthLabel(TODAY)}`}
      />

      <GradientPanel tint="sky" className="mb-6">
        <p className="text-[15px] font-semibold text-ink-secondary">
          Your entire practice at a glance
        </p>
        <h2 className="mt-1 max-w-[26ch] text-[26px] font-extrabold leading-tight tracking-[-0.025em] text-ink">
          {data.monthVisits} visits, {collected.value}
          {collected.unit ?? ""} collected, {alertCount} stock{" "}
          {alertCount === 1 ? "alert" : "alerts"}
        </h2>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            tint="plain"
            label="Visits"
            value={data.monthVisits}
            icon={<Users size={17} />}
          />
          <StatTile
            tint="plain"
            label="Collected"
            value={collected.value}
            unit={collected.unit}
            icon={<IndianRupee size={17} />}
          />
          <StatTile
            tint="plain"
            label="New patients"
            value={data.newPatients}
            icon={<Stethoscope size={17} />}
          />
          <StatTile
            tint="plain"
            label="Stock alerts"
            value={alertCount}
            icon={<Package size={17} />}
          />
        </div>
      </GradientPanel>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-[var(--radius-card)] bg-surface p-5 shadow-soft lg:col-span-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[17px] font-bold tracking-[-0.015em] text-ink">
              Visits by day
            </h3>
            <span className="text-[13px] font-medium text-ink-secondary">
              This month
            </span>
          </div>
          <div className="mt-4">
            {data.visitsByDay.length > 0 ? (
              <MiniBars values={data.visitsByDay.map((d) => d.count)} />
            ) : (
              <p className="text-[14px] text-ink-secondary">No visits yet.</p>
            )}
          </div>
          {data.visitsByDay.length > 0 ? (
            <p className="mt-3 text-[14px] text-ink-secondary">
              Busiest day so far: {maxDay} visit{maxDay > 1 ? "s" : ""}.
            </p>
          ) : null}
        </div>

        <div className="grid gap-4">
          <StatTile
            tint="mint"
            label="Revenue split"
            value={consultShare}
            unit="% consult"
            footer={
              <div className="flex flex-wrap gap-1.5">
                <StatusPill tone="success">Pharmacy {pharmacyShare}%</StatusPill>
              </div>
            }
          />
          <StatTile
            tint="sky"
            label="Pharmacy income"
            value={formatPaise(data.goodsRevenuePaise)}
          />
        </div>
      </div>

      {data.expiringAlerts.length > 0 ? (
        <div className="mb-6">
          <SectionLabel>Needs attention</SectionLabel>
          <div className="flex flex-col gap-2.5">
            {data.expiringAlerts.map((a) => (
              <AlertBanner
                key={`${a.itemName}-${a.batchNo}`}
                tone={a.days <= 30 ? "alert" : "warning"}
                title={`${a.itemName} — batch ${a.batchNo}`}
                detail={`Expires in ${a.days} days · ${a.quantity} ${a.unit} left`}
              />
            ))}
          </div>
        </div>
      ) : null}

      {data.lowStock.length > 0 ? (
        <div className="mb-6">
          <SectionLabel>Below reorder level</SectionLabel>
          <GroupedList>
            {data.lowStock.map((s) => (
              <Row
                key={s.itemName}
                title={s.itemName}
                subtitle={`reorder at ${s.reorder}`}
                trailing={
                  <StatusPill tone="warning">
                    {s.quantity} {s.unit} left
                  </StatusPill>
                }
              />
            ))}
          </GroupedList>
        </div>
      ) : null}

      <div className="max-w-sm">
        <Link
          href="/print/statement"
          target="_blank"
          className="flex w-full min-h-[var(--touch-primary)] items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-accent px-6 text-[17px] font-semibold text-accent-ink shadow-[0_8px_20px_-8px_var(--accent)] transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Printer size={19} />
          Export monthly statement
        </Link>
      </div>
    </>
  );
}
