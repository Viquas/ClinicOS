import { getStaff } from "@/db/queries/staff";
import { LoginScreen } from "./login-screen";

/* Always render against current clinic state — a staff picker frozen at
   build time would show a deactivated employee as pickable. */
export const dynamic = "force-dynamic";

/* Until auth is wired, the clinic is fixed to the seeded scenario. */
const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

export default async function LoginPage() {
  const staff = await getStaff(CLINIC_ID);
  return <LoginScreen staff={staff.filter((s) => s.isActive)} />;
}
