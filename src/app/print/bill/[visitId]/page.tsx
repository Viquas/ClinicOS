import { getBillReceiptData } from "@/db/queries/bill-receipt";
import type { BillReceiptData } from "@/db/queries/bill-receipt";
import { tenantDb } from "@/db/tenant-db";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { formatPaise } from "@/lib/billing/gst";
import { titleCase } from "@/lib/format";
import { whatsAppLink } from "@/lib/whatsapp";
import { notFound } from "next/navigation";
import { PrintActions } from "../../print-actions";

export const dynamic = "force-dynamic";

/** Payment modes on a receipt: UPI stays an acronym, the rest title-case. */
function modeLabel(mode: string): string {
  return mode === "upi" ? "UPI" : titleCase(mode);
}

function docDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** The plain-text receipt WhatsApp carries — it must read on its own. */
function buildReceiptMessage(data: BillReceiptData): string {
  const parts: string[] = [];
  parts.push(`*${data.clinic.name}*`);
  parts.push(`Receipt · ${data.patient.name} · ${docDate(data.bill.date)}`);
  parts.push("");
  data.lines.forEach((l) => {
    parts.push(`${l.description} — ${formatPaise(l.lineTotalPaise)}`);
  });
  parts.push("");
  parts.push(`Total paid: ${formatPaise(data.bill.amountPaidPaise)}`);
  if (data.payments.length > 0) {
    parts.push(`Paid by ${data.payments.map((p) => p.mode.toUpperCase()).join(" + ")}`);
  }
  return parts.join("\n");
}

export default async function BillReceiptPrintPage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const { visitId } = await params;
  const clinicId = await getActiveClinicId();
  const data = await tenantDb((tx) => getBillReceiptData(clinicId, visitId, tx));
  if (!data) notFound();

  const { clinic, patient, bill, payments, lines } = data;
  const addr = [clinic.addressLine, clinic.city, clinic.pincode]
    .filter(Boolean)
    .join(", ");
  const services = lines.filter((l) => l.kind === "service");
  const goods = lines.filter((l) => l.kind === "goods");
  const waLink = whatsAppLink(patient.phone, buildReceiptMessage(data));

  return (
    <div className="min-h-screen bg-canvas print:bg-white">
      <PrintActions waLink={waLink} waLabel="Send receipt on WhatsApp" />

      <div className="mx-auto max-w-[720px] px-4 py-6 print:p-0">
        <article className="print-sheet rounded-[8px] bg-white p-8 text-[#0f1c26] shadow-soft sm:p-10 print:rounded-none print:shadow-none">
          {/* Letterhead */}
          <header className="border-b-2 border-[#0a8352] pb-4 text-center">
            <h1 className="text-[22px] font-extrabold tracking-[-0.02em] text-[#0a8352]">
              {clinic.name}
            </h1>
            {addr ? (
              <p className="mt-1 text-[13px] text-[#5b7286]">{addr}</p>
            ) : null}
            <p className="text-[13px] text-[#5b7286]">
              {clinic.phone ? `Ph: ${clinic.phone}` : ""}
              {clinic.phone && clinic.isGstRegistered && clinic.gstin ? " · " : ""}
              {clinic.isGstRegistered && clinic.gstin ? `GSTIN: ${clinic.gstin}` : ""}
            </p>
            <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.15em] text-[#5b7286]">
              {clinic.isGstRegistered ? "Tax Invoice" : "Receipt"}
            </p>
          </header>

          {/* Patient / date */}
          <section className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[#e2e8ef] py-3 text-[14px]">
            <span>
              <span className="text-[#5b7286]">Patient: </span>
              <span className="font-semibold">{patient.name}</span>
            </span>
            <span>
              <span className="text-[#5b7286]">Date: </span>
              <span className="font-semibold">{docDate(bill.date)}</span>
            </span>
          </section>

          {/* Line items */}
          <table className="mt-4 w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-[#e2e8ef] text-left text-[12px] uppercase tracking-wide text-[#5b7286]">
                <th className="py-1.5 font-semibold">Item</th>
                <th className="py-1.5 text-center font-semibold">Qty</th>
                <th className="py-1.5 text-right font-semibold">Rate</th>
                <th className="py-1.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {services.length > 0 ? (
                <SectionHead label="Services (GST exempt)" />
              ) : null}
              {services.map((l, i) => (
                <ReceiptRow key={`s-${i}`} line={l} />
              ))}
              {goods.length > 0 ? (
                <SectionHead label="Medicines & consumables" />
              ) : null}
              {goods.map((l, i) => (
                <ReceiptRow key={`g-${i}`} line={l} showRate />
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-4 flex justify-end">
            <dl className="w-full max-w-[300px] space-y-1.5 text-[14px]">
              <TotalRow label="Subtotal" value={formatPaise(bill.subtotalPaise)} />
              {bill.discountPaise > 0 ? (
                <TotalRow
                  label="Discount"
                  value={`− ${formatPaise(bill.discountPaise)}`}
                />
              ) : null}
              {bill.taxPaise > 0 ? (
                <TotalRow
                  label={clinic.isGstRegistered ? "GST (incl.)" : "GST"}
                  value={formatPaise(bill.taxPaise)}
                />
              ) : null}
              <div className="mt-1 flex items-baseline justify-between border-t-2 border-[#0f1c26] pt-2">
                <dt className="text-[16px] font-bold">Total paid</dt>
                <dd className="tabular text-[20px] font-extrabold">
                  {formatPaise(bill.amountPaidPaise)}
                </dd>
              </div>
            </dl>
          </div>

          <p className="mt-4 text-[13px] text-[#5b7286]">
            {payments.length > 0
              ? `Paid by ${payments
                  .map((p) => `${modeLabel(p.mode)} ${formatPaise(p.amountPaise)}`)
                  .join(" + ")}`
              : null}
          </p>

          <footer className="mt-8 border-t border-[#e2e8ef] pt-3 text-center text-[11px] text-[#8ba6b8]">
            {clinic.ceaRegistrationNo ? `Clinic Reg. ${clinic.ceaRegistrationNo} · ` : ""}
            Thank you · Generated by ClinicOS
          </footer>
        </article>
      </div>
    </div>
  );
}

function SectionHead({ label }: { label: string }) {
  return (
    <tr>
      <td
        colSpan={4}
        className="pt-3 pb-1 text-[12px] font-semibold uppercase tracking-wide text-[#5b7286]"
      >
        {label}
      </td>
    </tr>
  );
}

function ReceiptRow({
  line,
  showRate,
}: {
  line: BillReceiptData["lines"][number];
  showRate?: boolean;
}) {
  return (
    <tr className="border-b border-[#eef2f6]">
      <td className="py-2 align-top">
        <div className="font-medium">{line.description}</div>
        {showRate && line.gstRate > 0 ? (
          <div className="text-[12px] text-[#8ba6b8]">
            GST {line.gstRate}% incl.
          </div>
        ) : null}
      </td>
      <td className="py-2 text-center align-top tabular">{line.quantity}</td>
      <td className="py-2 text-right align-top tabular">
        {formatPaise(line.unitPaise)}
      </td>
      <td className="py-2 text-right align-top tabular font-semibold">
        {formatPaise(line.lineTotalPaise)}
      </td>
    </tr>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-[#5b7286]">{label}</dt>
      <dd className="tabular font-semibold">{value}</dd>
    </div>
  );
}
