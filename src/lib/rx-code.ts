/**
 * Human-readable prescription code (§9.2 verification).
 *
 * The full UUID is what the QR encodes and what the record stores; this is
 * the short form a pharmacist reads over the phone or matches by eye. Eight
 * hex chars ≈ 4 billion combinations — collision within one clinic's
 * lifetime of prescriptions is not a practical concern, and the QR carries
 * the full id for exact verification.
 */
export function rxDisplayCode(uuid: string): string {
  const hex = uuid.replace(/-/g, "").toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}
