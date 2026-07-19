import { getDashboard } from "@/db/queries/dashboard";
import { getMessages } from "@/db/queries/messages";
import { getDoctorFollowUpsToday } from "@/db/queries/home";
import { getMrQueue } from "@/db/queries/mr";
import { getStock } from "@/db/queries/pharmacy";
import { getDoctors, getQueue } from "@/db/queries/queue";
import { getNursingTasks } from "@/db/queries/tasks";
import { getVaccinationRoster } from "@/db/queries/vaccinations";
import { getCurrentStaff } from "@/lib/auth/current-staff";
import { HomeScreen } from "./home-screen";

/*
 * Always render against current clinic state — a role home frozen at build
 * time would tell a doctor about yesterday's queue. Any page reading mutable
 * clinic data must be dynamic.
 */
export const dynamic = "force-dynamic";

/* Until auth is wired, the clinic and date are fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";
const TODAY = "2026-07-18";
const MONTH_START = "2026-07-01";
const MONTH_END = "2026-07-31";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const { denied } = await searchParams;
  const currentStaff = await getCurrentStaff(CLINIC_ID);
  const roles = currentStaff.roles;

  const needsQueue =
    roles.includes("owner") ||
    roles.includes("doctor") ||
    roles.includes("front_desk") ||
    roles.includes("nurse") ||
    roles.includes("pharmacy");
  const needsDashboard = roles.includes("owner") || roles.includes("pharmacy");

  const [queue, dashboard, messages, nursingTasks, vaccinationRoster, mrQueue, stock, doctors] =
    await Promise.all([
      needsQueue ? getQueue(CLINIC_ID, TODAY) : Promise.resolve([]),
      needsDashboard
        ? getDashboard(CLINIC_ID, MONTH_START, MONTH_END, TODAY)
        : Promise.resolve(null),
      roles.includes("owner") || roles.includes("front_desk")
        ? getMessages(CLINIC_ID)
        : Promise.resolve([]),
      roles.includes("owner") || roles.includes("nurse")
        ? getNursingTasks(CLINIC_ID, TODAY)
        : Promise.resolve([]),
      roles.includes("owner") || roles.includes("nurse")
        ? getVaccinationRoster(CLINIC_ID, TODAY)
        : Promise.resolve([]),
      roles.includes("owner") || roles.includes("doctor") || roles.includes("front_desk")
        ? getMrQueue(
            CLINIC_ID,
            new Date(`${TODAY}T00:00:00+05:30`),
            new Date(`${TODAY}T23:59:59.999+05:30`),
          )
        : Promise.resolve([]),
      needsDashboard ? getStock(CLINIC_ID) : Promise.resolve([]),
      roles.includes("owner") ? getDoctors(CLINIC_ID) : Promise.resolve([]),
    ]);

  const followUps = currentStaff.doctorId
    ? await getDoctorFollowUpsToday(CLINIC_ID, currentStaff.doctorId, TODAY)
    : [];

  const lowStock = stock.filter((item) => {
    const totalRemaining = item.batches.reduce((sum, b) => sum + b.quantityRemaining, 0);
    return totalRemaining <= item.reorderLevel;
  });

  return (
    <HomeScreen
      staffName={currentStaff.name}
      deniedRoute={denied ?? null}
      roles={roles}
      doctorName={
        currentStaff.doctorId
          ? doctors.find((d) => d.id === currentStaff.doctorId)?.name ?? null
          : null
      }
      owner={
        roles.includes("owner") && dashboard
          ? {
              monthVisits: dashboard.monthVisits,
              monthRevenuePaise: dashboard.monthRevenuePaise,
              newPatients: dashboard.newPatients,
              lowStockCount: lowStock.length,
              expiringCount: dashboard.expiringAlerts.length,
            }
          : undefined
      }
      doctor={
        roles.includes("doctor") && currentStaff.doctorId
          ? {
              waitingForMe: queue.filter(
                (q) =>
                  q.doctorId === currentStaff.doctorId &&
                  (q.state === "waiting" || q.state === "vitals_done"),
              ).length,
              withMeNow: queue.filter(
                (q) => q.doctorId === currentStaff.doctorId && q.state === "with_doctor",
              ).length,
              followUps,
              repsWaiting: mrQueue.filter(
                (r) => r.doctorId === currentStaff.doctorId && r.state === "waiting",
              ).length,
            }
          : undefined
      }
      frontDesk={
        roles.includes("front_desk")
          ? {
              waitingCount: queue.filter((q) => q.state === "waiting").length,
              tokensToday: queue.length,
              failedMessages: messages.filter((m) => m.status === "failed").length,
            }
          : undefined
      }
      nurse={
        roles.includes("nurse")
          ? {
              pendingTasks: nursingTasks.filter(
                (t) => t.state === "pending" || t.state === "in_progress",
              ).length,
              vaccinesDue: vaccinationRoster.filter((r) => r.owed.length > 0).length,
            }
          : undefined
      }
      pharmacy={
        roles.includes("pharmacy") && dashboard
          ? {
              lowStockCount: lowStock.length,
              expiringCount: dashboard.expiringAlerts.length,
              dispenseQueueCount: queue.filter((q) => q.state === "at_pharmacy").length,
            }
          : undefined
      }
    />
  );
}
