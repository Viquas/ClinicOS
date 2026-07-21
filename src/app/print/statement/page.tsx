import { getDashboard } from "@/db/queries/dashboard";
import { getClinicProfile } from "@/db/queries/clinic";
import { tenantDb } from "@/db/tenant-db";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { requireRouteAccess } from "@/lib/auth/route-access";
import {
  clinicMonthBounds,
  clinicMonthLabel,
  clinicToday,
} from "@/lib/clinic-date";
import { formatPaise } from "@/lib/billing/gst";
import { PrintActions } from "../print-actions";

export const dynamic = "force-dynamic";

/**
 * The owner's monthly statement, print-ready (§7.11). This is the destination
 * of the dashboard's "Export monthly statement" — the figure an accountant is
 * handed at month end: visits, what was collected split by consultation vs
 * pharmacy, new patients, and the stock that needs attention.
 *
 * It reads the same getDashboard aggregate the on-screen dashboard does, so the
 * paper and the screen can never disagree.
 */
export default async function StatementPrintPage() {
  const today = clinicToday();
  const { start, end } = clinicMonthBounds();
  const clinicId = await getActiveClinicId();
  await requireRouteAccess(clinicId, "/dashboard");
  const [data, clinic] = await Promise.all([
    tenantDb((tx) => getDashboard(clinicId, start, end, today, tx)),
    getClinicProfile(clinicId),
  ]);

  const addr = [clinic?.addressLine, clinic?.city, clinic?.pincode]
    .filter(Boolean)
    .join(", ");
  const consultShare =
    data.monthRevenuePaise > 0
      ? Math.round((data.serviceRevenuePaise / data.monthRevenuePaise) * 100)
      : 0;
  const alertCount = data.expiringAlerts.length + data.lowStock.length;

  return (
    <div className="min-h-screen bg-canvas print:bg-white">
      <PrintActions waLink={null} />

      <div className="mx-auto max-w-[760px] px-4 py-6 print:p-0">
        <article className="print-sheet rounded-[8px] bg-white p-8 text-[#0f1c26] shadow-soft sm:p-10 print:rounded-none print:shadow-none">
          <header className="border-b-2 border-[#0a8352] pb-4">
            <h1 className="text-[22px] font-extrabold tracking-[-0.02em] text-[#0a8352]">
              {clinic?.name ?? "Your clinic"}
            </h1>
            {addr ? <p className="mt-1 text-[13px] text-[#5b7286]">{addr}</p> : null}
            <p className="mt-2 text-[15px] font-bold">
              Monthly statement — {clinicMonthLabel(today)}
            </p>
          </header>

          {/* Headline figures */}
          <section className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure label="Visits" value={String(data.monthVisits)} />
            <Figure label="Collected" value={formatPaise(data.monthRevenuePaise)} />
            <Figure label="New patients" value={String(data.newPatients)} />
            <Figure label="Stock alerts" value={String(alertCount)} />
          </section>

          {/* Revenue breakdown */}
          <section className="mt-7">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#5b7286]">
              Revenue breakdown
            </h2>
            <dl className="mt-2 divide-y divide-[#eef2f6] text-[14px]">
              <StatementRow
                label="Consultation & procedures (GST exempt)"
                value={formatPaise(data.serviceRevenuePaise)}
              />
              <StatementRow
                label="Pharmacy & consumables (GST incl.)"
                value={formatPaise(data.goodsRevenuePaise)}
              />
              <div className="flex items-baseline justify-between border-t-2 border-[#0f1c26] py-2.5">
                <dt className="text-[15px] font-bold">Total collected</dt>
                <dd className="tabular text-[18px] font-extrabold">
                  {formatPaise(data.monthRevenuePaise)}
                </dd>
              </div>
            </dl>
            {data.monthRevenuePaise > 0 ? (
              <p className="mt-2 text-[13px] text-[#5b7286]">
                Consultation {consultShare}% · Pharmacy {100 - consultShare}% of
                collections.
              </p>
            ) : null}
          </section>

          {/* Stock attention */}
          {data.lowStock.length > 0 || data.expiringAlerts.length > 0 ? (
            <section className="mt-7">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#5b7286]">
                Needs attention
              </h2>
              <ul className="mt-2 flex flex-col gap-1 text-[14px]">
                {data.lowStock.map((s) => (
                  <li key={`low-${s.itemName}`} className="flex justify-between gap-4">
                    <span>{s.itemName} — below reorder level</span>
                    <span className="tabular shrink-0 text-[#5b7286]">
                      {s.quantity} {s.unit} left
                    </span>
                  </li>
                ))}
                {data.expiringAlerts.map((a) => (
                  <li
                    key={`exp-${a.itemName}-${a.batchNo}`}
                    className="flex justify-between gap-4"
                  >
                    <span>
                      {a.itemName} (batch {a.batchNo}) — expiring
                    </span>
                    <span className="tabular shrink-0 text-[#5b7286]">
                      {a.days} days
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <footer className="mt-10 border-t border-[#e2e8ef] pt-3 text-[11px] text-[#8ba6b8]">
            {clinic?.ceaRegistrationNo ? `Clinic Reg. ${clinic.ceaRegistrationNo} · ` : ""}
            Generated by ClinicOS on {docDate(today)}
          </footer>
        </article>
      </div>
    </div>
  );
}

function docDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-[#f4f8fb] p-3.5">
      <div className="text-[12px] font-semibold text-[#5b7286]">{label}</div>
      <div className="tabular mt-1 text-[22px] font-extrabold tracking-[-0.02em]">
        {value}
      </div>
    </div>
  );
}

function StatementRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-[#334759]">{label}</dt>
      <dd className="tabular font-semibold">{value}</dd>
    </div>
  );
}
