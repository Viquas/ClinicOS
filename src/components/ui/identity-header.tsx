"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { StatusPill } from "./status";

/** Ravi Kumar → RK. Two initials max; Indian names run long. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Masks all but the last four digits (§8.3 rule 5).
 *
 * Any screen a waiting patient can see over the counter shows the masked form;
 * the last four digits stay visible because that is what front desk reads back
 * to confirm identity.
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return `••••• ${digits.slice(-4)}`;
}

/**
 * Who am I looking at — the header on every patient-context screen.
 * Age and sex sit beside the name because they change the reading of every
 * vital below them.
 */
export function IdentityHeader({
  name,
  ageLabel,
  sex,
  phone,
  /* Shared screens mask by default; the consultation room can opt out. */
  maskContact = true,
  tags,
  trailing,
}: {
  name: string;
  ageLabel: string;
  sex: string;
  phone?: string;
  maskContact?: boolean;
  tags?: string[];
  trailing?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-3.5">
      <div
        aria-hidden
        className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-full",
          "bg-black/[0.05] text-[19px] font-bold text-ink-secondary dark:bg-white/[0.09]",
        )}
      >
        {initials(name)}
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[22px] font-extrabold tracking-[-0.02em] text-ink">
          {name}
        </h1>
        <p className="truncate text-[15px] text-ink-secondary">
          {ageLabel} · {sex}
          {phone ? ` · ${maskContact ? maskPhone(phone) : phone}` : ""}
        </p>
        {tags?.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <StatusPill key={tag}>{tag}</StatusPill>
            ))}
          </div>
        ) : null}
      </div>

      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </header>
  );
}
