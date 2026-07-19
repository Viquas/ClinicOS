import { getConsultContext } from "@/db/queries/consult";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { getStock } from "@/db/queries/pharmacy";
import { resolveSpecialtyPack } from "@/lib/clinical/specialties";
import { notFound, redirect } from "next/navigation";
import { ConsultForm } from "./consult-form";

/*
 * Always render against current clinic state — a consult screen frozen at
 * build time could prescribe against stock that has since sold out. Any
 * page reading mutable clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";


export default async function ConsultPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ visitId?: string }>;
}) {
  const { patientId } = await params;
  const { visitId } = await searchParams;
  if (!visitId) notFound();

  const [ctx, stock] = await Promise.all([
    getConsultContext(await getActiveClinicId(), visitId),
    getStock(await getActiveClinicId()),
  ]);
  if (!ctx || ctx.patient.id !== patientId) notFound();

  /* The consult belongs to the with_doctor step only — a token already past
     it (or completed by a second tab) has nothing left to do here. */
  if (ctx.tokenState !== "with_doctor") redirect("/queue");

  const pack = resolveSpecialtyPack(
    ctx.doctor.specialty,
    ctx.doctor.templatePackOverride,
  );

  return (
    <ConsultForm
      visitId={visitId}
      tokenId={ctx.tokenId}
      doctorId={ctx.doctor.id}
      canPrescribe={Boolean(ctx.doctor.registrationNo)}
      patient={ctx.patient}
      vitals={ctx.vitals}
      diagnosisFavourites={pack.diagnosisFavourites}
      stock={stock
        .filter((item) => !item.isConsumable)
        .map((item) => ({
          id: item.id,
          name: item.name,
          strength: item.strength,
          unit: item.unit,
          scheduleClass: item.scheduleClass,
          quantity: item.batches.reduce((sum, b) => sum + b.quantityRemaining, 0),
        }))}
    />
  );
}
