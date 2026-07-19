import { getVitalsCaptureContext } from "@/db/queries/vitals-capture";
import { tenantDb } from "@/db/tenant-db";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { resolveSpecialtyPack } from "@/lib/clinical/specialties";
import { notFound, redirect } from "next/navigation";
import { VitalsForm } from "./vitals-form";

/*
 * Always render against current clinic state — a vitals form frozen at build
 * time could submit against a token that already advanced. Any page reading
 * mutable clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";


export default async function VitalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ visitId?: string }>;
}) {
  const { patientId } = await params;
  const { visitId } = await searchParams;
  if (!visitId) notFound();

  const clinicId = await getActiveClinicId();
  const ctx = await tenantDb((tx) =>
    getVitalsCaptureContext(clinicId, visitId, tx),
  );
  if (!ctx || ctx.patient.id !== patientId) notFound();

  /* Vitals belong to the waiting step only — a token already past it (or one
     a second tab already completed) has nothing left to record here. */
  if (ctx.tokenState !== "waiting") redirect("/queue");

  const pack = resolveSpecialtyPack(ctx.doctorSpecialty, ctx.templatePackOverride);

  return (
    <VitalsForm
      visitId={visitId}
      tokenId={ctx.tokenId}
      patient={ctx.patient}
      vitalFields={pack.vitalFields}
      showGrowthTrend={pack.modules.growthTrends}
      priorValues={ctx.priorValues}
    />
  );
}
