import type { Metadata, Viewport } from "next";
import { getClinicProfile } from "@/db/queries/clinic";
import { getActiveClinicId } from "@/lib/auth/current-clinic";
import { AppChrome } from "@/components/app-chrome";
import { getCurrentStaff } from "@/lib/auth/current-staff";
import { resolveSpecialtyPack } from "@/lib/clinical/specialties";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";


export const metadata: Metadata = {
  title: "ClinicOS",
  description: "Runs the whole clinic — front desk to pharmacy.",
};

export const viewport: Viewport = {
  /*
   * No user-scalable:false. Zoom is an accessibility affordance and this runs
   * on shared tablets where an older doctor may need it (§8.5).
   */
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F2F7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const clinicId = await getActiveClinicId();
  const [currentStaff, clinic] = await Promise.all([
    getCurrentStaff(clinicId),
    getClinicProfile(clinicId),
  ]);

  /* Module visibility follows the clinic's specialty (§6): a dermatology
     clinic has no vaccination schedule, so the nav must not offer one. */
  const pack = resolveSpecialtyPack(clinic?.primarySpecialty, {});
  const hiddenRoutes = [
    ...(pack.modules.vaccinations ? [] : ["/vaccinations"]),
  ];

  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/*
          Applies the stored theme before first paint — see lib/theme.ts.

          dangerouslySetInnerHTML is safe here and must stay that way: the
          script is a compile-time constant with no interpolation and no
          user-controlled input. Never build this string from request data,
          cookies, or search params.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      {/*
        suppressHydrationWarning on body as well as html: browser extensions
        (ColorZilla, Grammarly, etc.) inject attributes like cz-shortcut-listen
        onto <body> before React hydrates, and the mismatch was aborting
        hydration — which left every client component non-interactive. This
        suppresses only attribute diffs on this one element, not real ones in
        the tree below it.
      */}
      <body
        className="flex min-h-full flex-col bg-canvas"
        suppressHydrationWarning
      >
        <AppChrome
          staffName={currentStaff.name}
          staffRoles={currentStaff.roles}
          clinicName={clinic?.name ?? "ClinicOS"}
          clinicInitials={clinic?.initials ?? "CL"}
          hiddenRoutes={hiddenRoutes}
        >
          {children}
        </AppChrome>
      </body>
    </html>
  );
}
