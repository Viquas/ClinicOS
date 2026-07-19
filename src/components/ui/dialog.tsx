"use client";

import { cn } from "@/lib/utils";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";

const DialogTitleContext = createContext<string | undefined>(undefined);

/**
 * The modal shell every dialog in the app sits in.
 *
 * This is a real <dialog> driven by showModal(), not a div with an overlay
 * class, and that choice is load-bearing three times over:
 *
 *  1. Focus is trapped by the browser. A hand-rolled Tab cycle only contains
 *     focus within the document — it cannot stop Tab from walking out into the
 *     URL bar and back in behind the scrim. showModal() can.
 *  2. Everything outside is inert. Screen readers and pointers both stop at
 *     the dialog boundary without an aria-hidden sweep of the rest of the tree.
 *  3. It renders in the top layer, which outranks every stacking context
 *     unconditionally. The dialogs here used to carry z-[60] purely to win a
 *     fight with the z-50 bottom nav; in the top layer that fight cannot
 *     happen, so the z-index is gone rather than tuned.
 *
 * Escape is caught and turned back into an onClose() call instead of letting
 * the browser close the element on its own. The dialog is mounted from React
 * state, so a native close would leave the element shut while state still said
 * "open" — the next open would then be a no-op. State stays the one source of
 * truth for whether a dialog exists.
 */
export function Dialog({
  onClose,
  className,
  children,
}: {
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /* Captured before showModal() moves focus into the dialog. The browser
       restores focus on close too, but only if the element is still attached
       when it happens — React may detach first on unmount, so the trigger is
       remembered here and restored explicitly. */
    const trigger = document.activeElement as HTMLElement | null;

    el.showModal();

    return () => {
      el.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      /* Only a true backdrop hit matches: anything inside the dialog lands on
         a descendant, and the <dialog> box itself is the full viewport. */
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "fixed inset-0 m-0 h-full max-h-full w-full max-w-full border-0 bg-transparent p-4",
        /* open:flex, not flex — a bare display value would override the UA's
           display:none and paint the dialog before showModal() runs. */
        "hidden open:flex items-end justify-center sm:items-center",
        "pb-[calc(1rem+env(safe-area-inset-bottom))]",
        "backdrop:bg-black/40",
        className,
      )}
    >
      <DialogTitleContext.Provider value={titleId}>
        {children}
      </DialogTitleContext.Provider>
    </dialog>
  );
}

/**
 * The dialog's accessible name. Each screen keeps its own heading styling —
 * the alert-red allergy warning, the plain ink correction titles — while the
 * id wiring that names the dialog happens here rather than at five call sites.
 */
export function DialogTitle({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const id = useContext(DialogTitleContext);

  return (
    <h2 id={id} className={className}>
      {children}
    </h2>
  );
}
