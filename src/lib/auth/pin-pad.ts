/**
 * PIN pad state machine for the fast-switch screen (§7.12).
 *
 * Extracted from the component so the transitions are testable. This exists
 * as a reducer rather than a set of useState calls for a specific reason:
 * the first implementation read `pin` from a closure, so several taps landing
 * in one React batch each computed `"" + digit` and overwrote each other —
 * the pad silently dropped digits. Someone entering a 4-digit PIN taps about
 * as fast as that batching window, so it was the normal path, not an edge
 * case. A reducer always sees the true previous state.
 */

export const PIN_LENGTH = 4;
export const MAX_ATTEMPTS = 5;

export type PinState = {
  pin: string;
  attempts: number;
  error: string | null;
  unlocked: boolean;
};

export type PinAction =
  | { type: "digit"; digit: string }
  | { type: "backspace" }
  | { type: "reset" };

export const INITIAL_PIN_STATE: PinState = {
  pin: "",
  attempts: 0,
  error: null,
  unlocked: false,
};

/**
 * `expected` is injected so the component can supply whatever it verifies
 * against. In the real product this is never a client-side comparison — the
 * PIN unlocks a stored session server-side; see lib/auth/pin.ts.
 */
export function pinReducer(
  state: PinState,
  action: PinAction,
  expected: string,
): PinState {
  /* Locked out: nothing but an explicit reset moves the machine. */
  if (state.attempts >= MAX_ATTEMPTS && action.type !== "reset") return state;

  switch (action.type) {
    case "digit": {
      if (!/^\d$/.test(action.digit)) return state;
      /* Already unlocked, or the buffer is full — ignore further taps rather
         than letting a fast double-tap start a fifth digit. */
      if (state.unlocked || state.pin.length >= PIN_LENGTH) return state;

      const pin = state.pin + action.digit;
      if (pin.length < PIN_LENGTH) return { ...state, pin, error: null };

      if (pin === expected) {
        return { ...state, pin, error: null, unlocked: true };
      }

      const attempts = state.attempts + 1;
      return {
        pin: "",
        attempts,
        unlocked: false,
        error:
          attempts >= MAX_ATTEMPTS
            ? "Too many attempts. Ask the owner to unlock this device."
            : `Incorrect PIN — ${MAX_ATTEMPTS - attempts} attempts left`,
      };
    }

    case "backspace":
      return { ...state, pin: state.pin.slice(0, -1), error: null };

    case "reset":
      return INITIAL_PIN_STATE;
  }
}
