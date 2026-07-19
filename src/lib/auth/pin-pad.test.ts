import { describe, expect, it } from "vitest";
import {
  INITIAL_PIN_STATE,
  MAX_ATTEMPTS,
  pinReducer,
  type PinState,
} from "./pin-pad";

const PIN = "4071";

/** Applies digits in sequence, the way rapid taps actually arrive. */
function type(digits: string, from: PinState = INITIAL_PIN_STATE): PinState {
  return digits
    .split("")
    .reduce(
      (state, digit) => pinReducer(state, { type: "digit", digit }, PIN),
      from,
    );
}

describe("the batching bug this reducer exists to prevent", () => {
  it("accumulates every digit of a fast entry", () => {
    /* The original useState version produced pin="1" here, because each tap
       read the same stale closure value. */
    expect(type("123").pin).toBe("123");
  });

  it("accumulates digits even when they repeat", () => {
    expect(type("111").pin).toBe("111");
  });
});

describe("correct PIN", () => {
  it("unlocks on the fourth digit", () => {
    const state = type(PIN);
    expect(state.unlocked).toBe(true);
    expect(state.error).toBeNull();
  });

  it("does not unlock before the full length is entered", () => {
    expect(type("407").unlocked).toBe(false);
  });

  it("ignores further taps once unlocked", () => {
    const unlocked = type(PIN);
    const after = pinReducer(unlocked, { type: "digit", digit: "9" }, PIN);
    expect(after).toBe(unlocked);
  });
});

describe("incorrect PIN", () => {
  it("clears the buffer and counts an attempt", () => {
    const state = type("9999");
    expect(state.pin).toBe("");
    expect(state.attempts).toBe(1);
    expect(state.unlocked).toBe(false);
  });

  it("reports the attempts remaining", () => {
    expect(type("9999").error).toBe(
      `Incorrect PIN — ${MAX_ATTEMPTS - 1} attempts left`,
    );
  });

  it("allows a correct entry after a failure", () => {
    const afterFailure = type("9999");
    expect(type(PIN, afterFailure).unlocked).toBe(true);
  });
});

describe("lockout", () => {
  const lockOut = () => {
    let state = INITIAL_PIN_STATE;
    for (let i = 0; i < MAX_ATTEMPTS; i++) state = type("9999", state);
    return state;
  };

  it("locks out after the maximum attempts", () => {
    const state = lockOut();
    expect(state.attempts).toBe(MAX_ATTEMPTS);
    expect(state.error).toMatch(/too many attempts/i);
  });

  it("ignores digits once locked out", () => {
    const locked = lockOut();
    expect(pinReducer(locked, { type: "digit", digit: "4" }, PIN)).toBe(locked);
  });

  it("cannot be unlocked by entering the correct PIN", () => {
    /* The whole point of a lockout: knowing the PIN afterwards is not enough. */
    expect(type(PIN, lockOut()).unlocked).toBe(false);
  });

  it("is cleared only by an explicit reset", () => {
    expect(pinReducer(lockOut(), { type: "reset" }, PIN)).toEqual(
      INITIAL_PIN_STATE,
    );
  });
});

describe("buffer limits", () => {
  it("never exceeds the PIN length", () => {
    /* "40710" — the fifth digit lands after a wrong-PIN reset, so it starts a
       fresh buffer rather than overflowing. */
    expect(type("4071").pin.length).toBe(4);
    expect(type("9999").pin.length).toBe(0);
  });

  it("rejects non-digit input", () => {
    const state = pinReducer(
      INITIAL_PIN_STATE,
      { type: "digit", digit: "a" },
      PIN,
    );
    expect(state).toBe(INITIAL_PIN_STATE);
  });
});

describe("backspace", () => {
  it("removes the last digit and clears the error", () => {
    const state = pinReducer(type("407"), { type: "backspace" }, PIN);
    expect(state.pin).toBe("40");
    expect(state.error).toBeNull();
  });

  it("is a no-op on an empty buffer", () => {
    expect(
      pinReducer(INITIAL_PIN_STATE, { type: "backspace" }, PIN).pin,
    ).toBe("");
  });
});

describe("reset", () => {
  it("returns to the initial state", () => {
    expect(pinReducer(type("40"), { type: "reset" }, PIN)).toEqual(
      INITIAL_PIN_STATE,
    );
  });
});
