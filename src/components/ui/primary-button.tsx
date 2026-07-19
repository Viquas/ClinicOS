import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * One primary action per screen. Full-width, bottom-of-thumb-reach, labelled
 * with its outcome — "Finish & Call Next", never "Submit".
 *
 * Green carries primary actions in this system. `tone` exists for genuinely
 * destructive confirmations and is deliberately not red: red stays reserved
 * for clinical urgency, so a destructive action reads as a neutral outline
 * rather than competing with an allergy banner.
 */
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "accent" | "neutral";
  children: ReactNode;
};

export function PrimaryButton({
  tone = "accent",
  className,
  children,
  ...props
}: Props) {
  return (
    <button
      className={cn(
        "w-full min-h-[var(--touch-primary)] rounded-[var(--radius-pill)]",
        "px-6 text-[17px] font-semibold tracking-[-0.01em]",
        "transition-[background-color,opacity,transform] duration-150 ease-out",
        "active:scale-[0.985] disabled:pointer-events-none disabled:opacity-40",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        tone === "accent"
          ? "bg-accent text-accent-ink shadow-[0_8px_20px_-8px_var(--accent)] hover:bg-accent-hover"
          : "bg-transparent text-ink ring-1 ring-inset ring-hairline",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Secondary actions never compete: text-weight only, no fill. */
export function SecondaryButton({
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      className={cn(
        "min-h-[var(--touch-min)] rounded-[var(--radius-control)] px-4",
        "text-[16px] font-medium text-accent",
        "transition-opacity duration-150 active:opacity-60",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
