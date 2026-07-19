"use client";

import type { StaffRole } from "@/lib/auth/claims";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppNav } from "./app-nav";

/**
 * Routes that render full-bleed with no navigation.
 *
 * The waiting-room display runs unattended on a TV with no input device, so
 * navigation would be both useless and a privacy risk — anyone walking past
 * could tab into patient data.
 */
const BARE_ROUTES = ["/display", "/login"];

export function AppChrome({
  children,
  staffName,
  staffRoles,
}: {
  children: ReactNode;
  staffName: string;
  staffRoles: StaffRole[];
}) {
  const pathname = usePathname();

  if (BARE_ROUTES.some((route) => pathname.startsWith(route))) {
    return <>{children}</>;
  }

  return (
    <>
      {/* lg:pl offsets the left rail; pb clears the bottom bar below lg. */}
      <div className="flex-1 lg:pl-[248px]">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col px-4 pb-28 pt-5 sm:px-6 lg:pb-10">
          {children}
        </div>
      </div>
      <AppNav roles={staffRoles} staffName={staffName} />
    </>
  );
}
