import { getClinicProfile } from "@/db/queries/clinic";
import { getPatient } from "@/db/queries/patients";
import { getVaccinationRoster } from "@/db/queries/vaccinations";
import type { ScheduledDose } from "@/lib/clinical/vaccines";
import { tenantDb } from "@/db/tenant-db";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { clinicToday } from "@/lib/clinic-date";
import { ageLabel, titleCase } from "@/lib/format";
import { notFound } from "next/navigation";
import { PrintActions } from "../../print-actions";

export const dynamic = "force-dynamic";

function docDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusText(d: ScheduledDose): string {
  if (d.status === "given") return d.givenOn ? `Given ${docDate(d.givenOn)}` : "Given";
  if (d.status === "overdue") return `Overdue — due ${docDate(d.dueDate)}`;
  if (d.status === "due") return `Due now (${docDate(d.dueDate)})`;
  return `Due ${docDate(d.dueDate)}`;
}

/**
 * A child's immunisation card, print-ready (§7.6). This is the destination of
 * the vaccinations screen's "Print schedule card" — the card a parent keeps in
 * a pediatric clinic, showing every dose in the schedule, which are done, and
 * when the next ones fall due.
 */
export default async function VaccineCardPrintPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const today = clinicToday();
  const clinicId = await getActiveClinicId();

  const [roster, patient, clinic] = await Promise.all([
    tenantDb((tx) => getVaccinationRoster(clinicId, today, tx)),
    tenantDb((tx) => getPatient(clinicId, patientId, tx)),
    getClinicProfile(clinicId),
  ]);

  const child = roster.find((r) => r.patientId === patientId);
  if (!child || !patient) notFound();

  const addr = [clinic?.addressLine, clinic?.city, clinic?.pincode]
    .filter(Boolean)
    .join(", ");
  const givenCount = child.schedule.filter((d) => d.status === "given").length;

  return (
    <div className="min-h-screen bg-canvas print:bg-white">
      <PrintActions waLink={null} />

      <div className="mx-auto max-w-[760px] px-4 py-6 print:p-0">
        <article className="print-sheet rounded-[8px] bg-white p-8 text-[#0f1c26] shadow-soft sm:p-10 print:rounded-none print:shadow-none">
          <header className="flex items-start justify-between gap-6 border-b-2 border-[#0a8352] pb-4">
            <div className="min-w-0">
              <h1 className="text-[22px] font-extrabold tracking-[-0.02em] text-[#0a8352]">
                {clinic?.name ?? "Your clinic"}
              </h1>
              {addr ? <p className="mt-1 text-[13px] text-[#5b7286]">{addr}</p> : null}
            </div>
            <p className="shrink-0 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#5b7286]">
              Immunisation card
            </p>
          </header>

          <section className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[#e2e8ef] py-3 text-[14px]">
            <span>
              <span className="text-[#5b7286]">Child: </span>
              <span className="font-semibold">{patient.name}</span>
            </span>
            <span>
              <span className="text-[#5b7286]">Age/Sex: </span>
              <span className="font-semibold">
                {ageLabel(patient, today)} · {titleCase(patient.sex)}
              </span>
            </span>
            {child.guardianName ? (
              <span>
                <span className="text-[#5b7286]">c/o </span>
                <span className="font-semibold">{child.guardianName}</span>
              </span>
            ) : null}
          </section>

          <p className="mt-3 text-[13px] text-[#5b7286]">
            {givenCount} of {child.schedule.length} scheduled doses recorded as
            given.
          </p>

          <table className="mt-3 w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-[#e2e8ef] text-left text-[12px] uppercase tracking-wide text-[#5b7286]">
                <th className="w-8 py-1.5 font-semibold" />
                <th className="py-1.5 font-semibold">Vaccine</th>
                <th className="py-1.5 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {child.schedule.map((d) => (
                <tr key={d.dose.id} className="border-b border-[#eef2f6]">
                  <td className="py-2 align-top">
                    <span
                      className={
                        d.status === "given"
                          ? "text-[#0a8352]"
                          : "text-[#c3cfd8]"
                      }
                      aria-hidden
                    >
                      {d.status === "given" ? "☑" : "☐"}
                    </span>
                  </td>
                  <td
                    className={
                      d.status === "given"
                        ? "py-2 align-top text-[#5b7286]"
                        : "py-2 align-top font-medium"
                    }
                  >
                    {d.dose.name}
                  </td>
                  <td
                    className={
                      d.status === "overdue"
                        ? "py-2 text-right align-top font-semibold text-[#c0272d]"
                        : "py-2 text-right align-top text-[#5b7286]"
                    }
                  >
                    {statusText(d)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <footer className="mt-8 border-t border-[#e2e8ef] pt-3 text-[11px] text-[#8ba6b8]">
            Keep this card and bring it to every visit · Generated by ClinicOS on{" "}
            {docDate(today)}
          </footer>
        </article>
      </div>
    </div>
  );
}
