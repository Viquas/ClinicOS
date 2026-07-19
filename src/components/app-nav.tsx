"use client";

import type { StaffRole } from "@/lib/auth/claims";
import { cn } from "@/lib/utils";
import {
  Briefcase,
  ClipboardList,
  FolderOpen,
  Home,
  IndianRupee,
  LayoutDashboard,
  MessageCircle,
  MoreHorizontal,
  Package,
  Pill,
  Plus,
  Settings,
  Stethoscope,
  Syringe,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/**
 * Navigation.
 *
 * The left rail follows a feed-app convention (workspace header, a bold
 * standalone quick-action pill, then a plain icon+label list with a rounded
 * active state) rather than a conventional dashboard sidebar — it reads
 * calmer on a long shift, and the quick-action pill gives every screen a
 * one-tap way back to starting the next patient interaction.
 *
 * The quick-action pill is deliberately its own colour (ink, not the app's
 * green): it is chrome-level, always available, and distinct from the one
 * green primary action a given screen offers — the two must never compete
 * for the same visual weight.
 *
 * Two shapes for two postures: this rail on a landscape tablet or desktop,
 * and a bottom bar on anything narrower, because a nurse holding a tablet
 * portrait cannot reach the top of the screen.
 *
 * The bottom bar shows four primary destinations plus More rather than
 * squeezing nine tabs to 40px each — below about 48px, tap accuracy on a
 * budget touchscreen falls off badly.
 *
 * Each item declares which roles it serves (§7.8). This gates navigation
 * only — it is wayfinding, not a security boundary, so a direct URL still
 * loads for anyone; a real permission matrix enforced server-side is out of
 * scope for this pass (see docs/prd-role-adaptive.md). Owner always sees
 * every destination, listed or not.
 */
const NAV: {
  href: string;
  label: string;
  icon: typeof Users;
  primary?: boolean;
  roles: StaffRole[];
}[] = [
  { href: "/home", label: "Home", icon: Home, primary: true, roles: ["owner", "doctor", "front_desk", "nurse", "pharmacy"] },
  { href: "/reception", label: "Reception", icon: Users, primary: true, roles: ["owner", "front_desk"] },
  { href: "/queue", label: "Queue", icon: ClipboardList, primary: true, roles: ["owner", "doctor", "front_desk", "nurse"] },
  { href: "/patients", label: "Patients", icon: FolderOpen, roles: ["owner", "doctor", "front_desk", "nurse"] },
  { href: "/tasks", label: "Tasks", icon: Stethoscope, roles: ["owner", "doctor", "nurse"] },
  { href: "/vaccinations", label: "Vaccines", icon: Syringe, roles: ["owner", "doctor", "nurse"] },
  { href: "/pharmacy", label: "Pharmacy", icon: Pill, primary: true, roles: ["owner", "pharmacy"] },
  { href: "/inventory", label: "Inventory", icon: Package, roles: ["owner", "pharmacy"] },
  { href: "/billing", label: "Billing", icon: IndianRupee, roles: ["owner", "front_desk"] },
  { href: "/mr", label: "Reps", icon: Briefcase, roles: ["owner", "doctor", "front_desk"] },
  { href: "/messages", label: "Messages", icon: MessageCircle, roles: ["owner", "front_desk"] },
  { href: "/dashboard", label: "Reports", icon: LayoutDashboard, roles: ["owner"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["owner", "doctor", "front_desk", "nurse", "pharmacy"] },
];

export function AppNav({
  roles = ["owner", "doctor", "front_desk", "nurse", "pharmacy"],
  staffName,
}: {
  roles?: StaffRole[];
  staffName?: string;
} = {}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string) => pathname.startsWith(href);
  const visible = NAV.filter(
    (item) => roles.includes("owner") || item.roles.some((r) => roles.includes(r)),
  );
  const primary = visible.filter((t) => t.primary);
  const overflow = visible.filter((t) => !t.primary);

  return (
    <>
      {/* Left rail — landscape tablet and desktop */}
      <nav
        aria-label="Main"
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-hairline",
          "bg-surface px-3 py-4 lg:flex",
        )}
      >
        {/* Workspace header — links to the clinic profile in Settings, the
            one place this identity is actually editable. */}
        <Link
          href="/settings"
          className="mb-3 flex items-center gap-2.5 rounded-[var(--radius-control)] p-2 transition-colors duration-150 hover:bg-surface-sunken"
        >
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-accent"
          >
            VC
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold leading-tight text-ink">
              ClinicOS
            </span>
            <span className="block truncate text-[12px] leading-tight text-ink-secondary">
              Vatsalya Child Care
            </span>
          </span>
        </Link>

        {/* Quick action — deliberately ink, not the app's green, so it never
            competes with a screen's own primary button. */}
        <Link
          href="/reception"
          className={cn(
            "mb-4 flex min-h-[46px] items-center justify-center gap-1.5 rounded-[var(--radius-pill)]",
            "bg-ink text-[14px] font-semibold text-surface",
            "transition-opacity duration-150 hover:opacity-90 active:opacity-80",
          )}
        >
          <Plus size={17} strokeWidth={2.4} />
          New visit
        </Link>

        {staffName ? (
          <Link
            href="/login"
            className="mb-3 flex items-center justify-between rounded-[var(--radius-control)] px-2 py-1 text-[12px] text-ink-secondary transition-colors duration-150 hover:bg-surface-sunken"
          >
            <span className="truncate">Signed in as {staffName}</span>
            <span className="shrink-0 font-semibold text-accent">Switch</span>
          </Link>
        ) : null}

        <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {visible.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={cn(
                  "flex min-h-[42px] items-center gap-3 rounded-[var(--radius-pill)] px-3",
                  "text-[14px] font-semibold transition-colors duration-150",
                  isActive(href)
                    ? "bg-accent-soft text-accent"
                    : "text-ink-secondary hover:bg-surface-sunken",
                )}
              >
                <Icon size={18} strokeWidth={isActive(href) ? 2.4 : 1.9} />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Bottom bar — portrait tablet and phone */}
      <nav
        aria-label="Main"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 border-t border-hairline lg:hidden",
          "bg-surface supports-[backdrop-filter]:bg-surface/90 supports-[backdrop-filter]:backdrop-blur-xl",
          "pb-[env(safe-area-inset-bottom)]",
        )}
      >
        <ul className="flex items-stretch">
          {primary.map(({ href, label, icon: Icon }) => (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={cn(
                  "flex min-h-[var(--touch-min)] flex-col items-center justify-center gap-1 py-2",
                  "text-[11px] font-semibold transition-colors duration-150",
                  isActive(href) ? "text-accent" : "text-ink-secondary",
                )}
              >
                <Icon size={22} strokeWidth={isActive(href) ? 2.4 : 1.9} />
                {label}
              </Link>
            </li>
          ))}
          <li className="flex-1">
            <button
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              className={cn(
                "flex min-h-[var(--touch-min)] w-full flex-col items-center justify-center gap-1 py-2",
                "text-[11px] font-semibold transition-colors duration-150",
                overflow.some((t) => isActive(t.href))
                  ? "text-accent"
                  : "text-ink-secondary",
              )}
            >
              <MoreHorizontal size={22} />
              More
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40 lg:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-[28px] bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-[17px] font-bold text-ink">More</span>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="flex h-11 w-11 items-center justify-center rounded-full text-ink-secondary"
              >
                <X size={20} />
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {overflow.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex min-h-[var(--touch-min)] items-center gap-3 rounded-[var(--radius-control)] px-4",
                      "text-[15px] font-semibold",
                      isActive(href)
                        ? "bg-accent-soft text-accent"
                        : "bg-surface-sunken text-ink",
                    )}
                  >
                    <Icon size={19} />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
