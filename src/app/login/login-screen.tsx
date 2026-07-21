"use client";

import { PrimaryButton } from "@/components/ui/primary-button";
import type { StaffRow } from "@/db/queries/staff";
import { switchStaffAction } from "@/lib/auth/switch-staff-action";
import { cn } from "@/lib/utils";
import { Delete } from "lucide-react";
import { useCallback, useEffect, useReducer, useState, useTransition } from "react";
import {
  INITIAL_PIN_STATE,
  MAX_ATTEMPTS,
  PIN_LENGTH,
  pinReducer,
  type PinAction,
  type PinState,
} from "@/lib/auth/pin-pad";

/**
 * Fast user-switching on a shared device (§7.12).
 *
 * The PIN here is NOT authenticating from scratch — see lib/auth/pin.ts. Each
 * staff member holds a real account established once by phone OTP; the device
 * stores their session and the PIN unlocks it. A stolen tablet without a PIN
 * is useless, and a stolen PIN without the tablet is useless.
 *
 * Staff are picked from a face-up list rather than typing a username, because
 * on a reception desk shared by four people the identity is already known —
 * the only question is who is touching the screen right now.
 *
 * This screen used to run entirely against `lib/mock/records` and never
 * persisted anything — unlocking navigated to a hardcoded /queue regardless
 * of who was picked, so "which user is logged in" had no effect anywhere in
 * the app. It now reads real seeded staff and, on unlock, calls
 * switchStaffAction to set the device-session cookie getCurrentStaff() reads.
 *
 * Prototype only. A real PIN is never compared in the browser — this shared
 * DEMO_PIN and the on-screen disclosure below exist so this stays honest
 * about being a UX stand-in, not a security check (a real per-staff PIN
 * needs server-side hash verification, out of scope for this pass).
 */
const DEMO_PIN = "4071";

export function LoginScreen({
  staff,
  clinicName,
}: {
  staff: StaffRow[];
  clinicName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const reduce = useCallback(
    (s: PinState, a: PinAction) => pinReducer(s, a, DEMO_PIN),
    [],
  );
  const [state, dispatch] = useReducer(reduce, INITIAL_PIN_STATE);

  const { pin, error, attempts, unlocked } = state;
  const picked = staff.find((s) => s.id === staffId);
  const lockedOut = attempts >= MAX_ATTEMPTS;

  /* The redirect on success lives inside switchStaffAction itself, so
     unlocking is a side effect of the PIN reducer reaching `unlocked`. */
  useEffect(() => {
    if (unlocked && staffId) {
      startTransition(async () => {
        const result = await switchStaffAction(staffId);
        if (result && !result.ok) setSwitchError(result.error);
      });
    }
  }, [unlocked, staffId]);

  const press = (digit: string) => dispatch({ type: "digit", digit });

  if (!picked) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
        <h1 className="text-[28px] font-extrabold tracking-[-0.025em] text-ink">
          Who&apos;s using this device?
        </h1>
        <p className="mt-1 text-[15px] text-ink-secondary">
          {clinicName} · reception tablet
        </p>

        <ul className="mt-6 flex flex-col gap-2.5">
          {staff.map((member) => (
            <li key={member.id}>
              <button
                onClick={() => {
                  setStaffId(member.id);
                  setSwitchError(null);
                  dispatch({ type: "reset" });
                }}
                className={cn(
                  "flex w-full min-h-[68px] items-center gap-3.5 rounded-[var(--radius-card)] bg-surface px-4 text-left",
                  "shadow-soft transition-transform duration-150 active:scale-[0.99]",
                )}
              >
                <span
                  aria-hidden
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[16px] font-bold text-ink-secondary"
                >
                  {member.name
                    .replace("Dr. ", "")
                    .split(" ")
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] font-bold text-ink">
                    {member.name}
                  </span>
                  <span className="block truncate text-[14px] text-ink-secondary">
                    {member.roles.map((r) => r.replace("_", " ")).join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-10">
      <button
        onClick={() => {
          setStaffId(null);
          setSwitchError(null);
          dispatch({ type: "reset" });
        }}
        className="self-start text-[15px] font-semibold text-accent"
      >
        ← Not you?
      </button>

      <h1 className="mt-5 text-[26px] font-extrabold tracking-[-0.025em] text-ink">
        {picked.name}
      </h1>
      <p className="text-[15px] text-ink-secondary">Enter your 4-digit PIN</p>

      {/* Filled dots, never the digits — this screen faces a waiting room. */}
      <div className="mt-7 flex justify-center gap-4" aria-hidden>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-4 w-4 rounded-full transition-colors duration-150",
              error
                ? "bg-alert/40"
                : i < pin.length
                  ? "bg-accent"
                  : "bg-ink-secondary/25",
            )}
          />
        ))}
      </div>
      <p
        role="status"
        className={cn(
          "mt-3 min-h-[22px] text-center text-[14px] font-semibold",
          error ? "text-alert" : "text-ink-secondary",
        )}
      >
        {switchError ?? error ?? (isPending ? "Signing in…" : " ")}
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <PinKey key={d} onClick={() => press(d)} disabled={lockedOut || isPending}>
            {d}
          </PinKey>
        ))}
        <span />
        <PinKey onClick={() => press("0")} disabled={lockedOut || isPending}>
          0
        </PinKey>
        <PinKey
          onClick={() => dispatch({ type: "backspace" })}
          disabled={lockedOut || isPending || pin.length === 0}
          label="Delete"
        >
          <Delete size={22} />
        </PinKey>
      </div>

      {lockedOut ? (
        <div className="mt-6">
          <PrimaryButton tone="neutral" onClick={() => setStaffId(null)}>
            Back to staff list
          </PrimaryButton>
        </div>
      ) : (
        <p className="mt-6 text-center text-[13px] text-ink-secondary">
          Prototype PIN is {DEMO_PIN}
        </p>
      )}
    </main>
  );
}

function PinKey({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        /* Deliberately oversized: entered fast, often one-handed, sometimes
           with a glove on. */
        "flex h-[66px] items-center justify-center rounded-[var(--radius-card)] bg-surface",
        "text-[26px] font-bold text-ink shadow-soft",
        "transition-transform duration-100 active:scale-[0.96]",
        "disabled:pointer-events-none disabled:opacity-35",
      )}
    >
      {children}
    </button>
  );
}
