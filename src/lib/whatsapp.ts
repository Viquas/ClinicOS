/**
 * WhatsApp deep links (§7.10).
 *
 * The clinic hands a patient the printed slip *and* pings the same content to
 * their phone — WhatsApp is how an Indian clinic actually reaches a patient
 * between visits. `wa.me` carries text only (no attachment), so the caller
 * builds a readable plain-text summary; the paper/PDF copy is the print path.
 */

/**
 * Normalises an Indian mobile to the digits `wa.me` expects: country code, no
 * `+`, no spaces. A bare 10-digit number gets the 91 prefix; a number already
 * carrying 91 (with or without a leading +) is left as-is. Returns null when
 * there is nothing dialable, so the caller can hide the affordance rather than
 * open a broken chat.
 */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  /* 11 digits starting 0 — the STD-style leading zero people still write. */
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;

  return digits.length >= 10 ? digits : null;
}

/** A ready-to-open wa.me URL, or null when the number can't be dialed. */
export function whatsAppLink(
  phone: string | null | undefined,
  message: string,
): string | null {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
