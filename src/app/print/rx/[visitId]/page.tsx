import { getPrescriptionPrintData } from "@/db/queries/prescription-print";
import type { PrescriptionPrintData } from "@/db/queries/prescription-print";
import { tenantDb } from "@/db/tenant-db";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { ageLabel, titleCase } from "@/lib/format";
import { whatsAppLink } from "@/lib/whatsapp";
import { notFound } from "next/navigation";
import { PrintActions } from "../../print-actions";

export const dynamic = "force-dynamic";

/** "20 Jul 2026" — compact and unambiguous on a document that gets filed. */
function docDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function scheduleTag(cls: "none" | "h" | "h1" | "x"): string | null {
  if (cls === "h") return "Schedule H";
  if (cls === "h1") return "Schedule H1";
  if (cls === "x") return "Schedule X";
  return null;
}

function line(d: PrescriptionPrintData["lines"][number]): string {
  const name = d.strength ? `${d.drugName} ${d.strength}` : d.drugName;
  const dur = d.durationDays ? ` × ${d.durationDays} day${d.durationDays > 1 ? "s" : ""}` : "";
  const extra = d.instructions ? ` (${d.instructions})` : "";
  return `${name} — ${d.dosage}${dur}${extra}`;
}

/** The plain-text copy WhatsApp carries — no attachment, so it must stand alone. */
function buildRxMessage(data: PrescriptionPrintData): string {
  const parts: string[] = [];
  parts.push(`*${data.clinic.name}*`);
  parts.push(`Prescription for ${data.patient.name} · ${docDate(data.visit.date)}`);
  parts.push(`Dr. ${data.doctor.name.replace(/^Dr\.?\s+/i, "")}`);
  parts.push("");
  if (data.visit.diagnosis) parts.push(`Diagnosis: ${data.visit.diagnosis}`);
  if (data.lines.length > 0) {
    parts.push("");
    data.lines.forEach((d, i) => parts.push(`${i + 1}. ${line(d)}`));
  }
  if (data.visit.advice) {
    parts.push("");
    parts.push(`Advice: ${data.visit.advice}`);
  }
  if (data.visit.followUpDate) {
    parts.push(`Follow-up: ${docDate(data.visit.followUpDate)}`);
  }
  return parts.join("\n");
}

export default async function PrescriptionPrintPage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const { visitId } = await params;
  const clinicId = await getActiveClinicId();
  const data = await tenantDb((tx) =>
    getPrescriptionPrintData(clinicId, visitId, tx),
  );
  if (!data) notFound();

  const { clinic, doctor, patient, visit, lines } = data;
  const addr = [clinic.addressLine, clinic.city, clinic.pincode]
    .filter(Boolean)
    .join(", ");
  const waLink = whatsAppLink(patient.phone, buildRxMessage(data));

  return (
    <div className="min-h-screen bg-canvas print:bg-white">
      <PrintActions waLink={waLink} />

      <div className="mx-auto max-w-[820px] px-4 py-6 print:p-0">
        <article className="print-sheet rounded-[8px] bg-white p-8 text-[#0f1c26] shadow-soft sm:p-10 print:rounded-none print:shadow-none">
          {/* Letterhead */}
          <header className="flex items-start justify-between gap-6 border-b-2 border-[#0a8352] pb-4">
            <div className="min-w-0">
              <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-[#0a8352]">
                {clinic.name}
              </h1>
              {addr ? (
                <p className="mt-1 text-[13px] leading-snug text-[#5b7286]">{addr}</p>
              ) : null}
              {clinic.phone ? (
                <p className="text-[13px] text-[#5b7286]">Ph: {clinic.phone}</p>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[16px] font-bold text-[#0f1c26]">{doctor.name}</p>
              {doctor.qualification ? (
                <p className="text-[13px] text-[#5b7286]">{doctor.qualification}</p>
              ) : null}
              <p className="text-[13px] capitalize text-[#5b7286]">
                {doctor.specialty}
              </p>
              {doctor.registrationNo ? (
                <p className="mt-1 text-[12px] text-[#5b7286]">
                  Reg. No: {doctor.registrationNo}
                  {doctor.registrationCouncil ? ` · ${doctor.registrationCouncil}` : ""}
                </p>
              ) : null}
            </div>
          </header>

          {/* Patient row */}
          <section className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[#e2e8ef] py-3 text-[14px]">
            <span>
              <span className="text-[#5b7286]">Patient: </span>
              <span className="font-semibold">{patient.name}</span>
            </span>
            <span>
              <span className="text-[#5b7286]">Age/Sex: </span>
              <span className="font-semibold">
                {ageLabel(patient, visit.date)} · {titleCase(patient.sex)}
              </span>
            </span>
            <span>
              <span className="text-[#5b7286]">Date: </span>
              <span className="font-semibold">{docDate(visit.date)}</span>
            </span>
          </section>

          {patient.allergies.length > 0 ? (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-[6px] bg-[#fbe9ea] px-2.5 py-1 text-[13px] font-semibold text-[#c0272d]">
              <span aria-hidden>●</span> Allergies: {patient.allergies.join(", ")}
            </p>
          ) : null}

          {visit.diagnosis ? (
            <p className="mt-4 text-[14px]">
              <span className="text-[#5b7286]">Diagnosis: </span>
              <span className="font-semibold">{visit.diagnosis}</span>
            </p>
          ) : null}

          {/* Rx */}
          <div className="mt-5 flex items-start gap-3">
            <span className="select-none font-serif text-[30px] font-bold leading-none text-[#0a8352]">
              ℞
            </span>
            <div className="min-w-0 flex-1">
              {lines.length > 0 ? (
                <ol className="flex flex-col divide-y divide-[#e2e8ef]">
                  {lines.map((d, i) => {
                    const tag = scheduleTag(d.scheduleClass);
                    return (
                      <li key={i} className="flex items-baseline gap-3 py-2.5">
                        <span className="w-5 shrink-0 text-[14px] font-semibold text-[#5b7286]">
                          {i + 1}.
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-[15px] font-bold">
                              {d.drugName}
                            </span>
                            {d.strength ? (
                              <span className="text-[14px] text-[#5b7286]">
                                {d.strength}
                              </span>
                            ) : null}
                            {tag ? (
                              <span className="rounded-[4px] bg-[#fdf1e3] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#a35a00]">
                                {tag}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 text-[14px] text-[#334759]">
                            <span className="tabular font-semibold">{d.dosage}</span>
                            {d.durationDays ? (
                              <span>
                                {" "}
                                · {d.durationDays} day
                                {d.durationDays > 1 ? "s" : ""}
                              </span>
                            ) : null}
                            {d.instructions ? <span> · {d.instructions}</span> : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="py-2 text-[14px] italic text-[#5b7286]">
                  No medication prescribed — advice only.
                </p>
              )}

              {lines.length > 0 ? (
                <p className="mt-2 text-[12px] text-[#8ba6b8]">
                  Dose read as morning–afternoon–night.
                </p>
              ) : null}
            </div>
          </div>

          {visit.advice ? (
            <p className="mt-5 text-[14px]">
              <span className="text-[#5b7286]">Advice: </span>
              {visit.advice}
            </p>
          ) : null}

          {visit.followUpDate ? (
            <p className="mt-2 text-[14px] font-semibold">
              Follow-up on {docDate(visit.followUpDate)}
            </p>
          ) : null}

          {/* Signature */}
          <footer className="mt-12 flex items-end justify-between gap-6">
            <p className="text-[11px] text-[#8ba6b8]">
              {clinic.ceaRegistrationNo
                ? `Clinic Reg. ${clinic.ceaRegistrationNo} · `
                : ""}
              Generated by ClinicOS
            </p>
            <div className="text-center">
              <div className="mb-1 w-52 border-t border-[#5b7286]" />
              <p className="text-[13px] font-semibold">{doctor.name}</p>
              {doctor.registrationNo ? (
                <p className="text-[11px] text-[#5b7286]">
                  Reg. {doctor.registrationNo}
                </p>
              ) : null}
            </div>
          </footer>
        </article>
      </div>
    </div>
  );
}
