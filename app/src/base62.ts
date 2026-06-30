import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BASE = ALPHABET.length; // 62

export const DEFAULT_CODE_LENGTH = 7;

/**
 * Generate a random base62 short code.
 *
 * We draw random bytes and reduce them modulo 62. Rejection-free modulo bias is
 * negligible here (62 vs 256) and the collision check at the DB layer (unique
 * constraint + retry) is the real guarantee of uniqueness — this function only
 * needs to produce well-distributed candidates.
 */
export function generateCode(length: number = DEFAULT_CODE_LENGTH): string {
  if (length <= 0) {
    throw new Error("code length must be positive");
  }
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i]! % BASE];
  }
  return out;
}

/** A valid code is one or more characters drawn from the base62 alphabet. */
export function isValidCode(code: string): boolean {
  return /^[0-9a-zA-Z]+$/.test(code);
}
