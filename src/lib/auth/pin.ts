import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

/**
 * PIN handling for fast user-switching on shared devices (PRD §7.12).
 *
 * What a PIN is and is not:
 *
 * A 4–6 digit PIN has at most a million combinations, so it is not a password
 * and must never be the sole factor authenticating a staff member from an
 * unknown device. The model here is that each staff member holds a real
 * Supabase auth account established once (phone OTP at invite acceptance). The
 * device stores their refresh token after that first sign-in, and the PIN
 * unlocks the already-established session on that device.
 *
 * So the PIN gates a local session switch, not a remote authentication. A
 * stolen tablet without a PIN yields nothing; a stolen PIN without the tablet
 * yields nothing. That is the property worth preserving as this grows — do not
 * add a "sign in with phone + PIN" path, which would collapse it.
 *
 * Rate limiting is the other half and is the caller's job: `verifyPin` is
 * constant-time but cannot see how many times it has been called.
 */

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

/** Consecutive runs and simple ascending/descending sequences. */
const WEAK_PIN_PATTERN = /^(\d)\1+$/;
const SEQUENTIAL = "0123456789";
const SEQUENTIAL_DESC = "9876543210";

export class WeakPinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeakPinError";
  }
}

export function assertPinAcceptable(pin: string): void {
  if (!/^\d+$/.test(pin)) {
    throw new WeakPinError("PIN must contain digits only");
  }
  if (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) {
    throw new WeakPinError(
      `PIN must be ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits`,
    );
  }
  if (WEAK_PIN_PATTERN.test(pin)) {
    throw new WeakPinError("PIN cannot be a single repeated digit");
  }
  if (SEQUENTIAL.includes(pin) || SEQUENTIAL_DESC.includes(pin)) {
    throw new WeakPinError("PIN cannot be a run of consecutive digits");
  }
}

/** Returns `scrypt$<salt-hex>$<hash-hex>` for storage in staff.pin_hash. */
export async function hashPin(pin: string): Promise<string> {
  assertPinAcceptable(pin);

  const salt = randomBytes(SALT_LENGTH);
  const derived = (await scryptAsync(pin, salt, KEY_LENGTH)) as Buffer;

  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/**
 * Constant-time comparison. Returns false rather than throwing on a malformed
 * stored hash, so a corrupted row denies access instead of leaking a distinct
 * error that would tell an attacker the account exists.
 */
export async function verifyPin(
  pin: string,
  storedHash: string | null,
): Promise<boolean> {
  if (!storedHash) return false;

  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const [, saltHex, hashHex] = parts;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }

  if (expected.length !== KEY_LENGTH || salt.length !== SALT_LENGTH) {
    return false;
  }

  const derived = (await scryptAsync(pin, salt, KEY_LENGTH)) as Buffer;
  return timingSafeEqual(derived, expected);
}
