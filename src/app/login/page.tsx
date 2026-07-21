import { getStaff } from "@/db/queries/staff";
import { getClinicProfile } from "@/db/queries/clinic";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { LoginScreen } from "./login-screen";

/* Always render against current clinic state — a staff picker frozen at
   build time would show a deactivated employee as pickable. */
export const dynamic = "force-dynamic";


export default async function LoginPage() {
  const clinicId = await getActiveClinicId();
  const [staff, clinic] = await Promise.all([
    getStaff(clinicId),
    getClinicProfile(clinicId),
  ]);
  return (
    <LoginScreen
      staff={staff.filter((s) => s.isActive)}
      clinicName={clinic?.name ?? "ClinicOS"}
    />
  );
}
