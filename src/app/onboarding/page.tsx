import { OnboardingWizard } from "./onboarding-wizard";

/* Creates a clinic through a server action, so nothing here may be
   statically pre-rendered. */
export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return <OnboardingWizard />;
}
