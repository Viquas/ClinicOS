import { getStaff } from "@/db/queries/staff";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { LoginScreen } from "./login-screen";

/* Always render against current clinic state — a staff picker frozen at
   build time would show a deactivated employee as pickable. */
export const dynamic = "force-dynamic";


export default async function LoginPage() {
  const staff = await getStaff(await getActiveClinicId());
  return <LoginScreen staff={staff.filter((s) => s.isActive)} />;
}
