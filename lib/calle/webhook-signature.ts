import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Generic HMAC-SHA256 placeholder over the exact raw body.
 * This is not claimed to be the official CALL-E signing contract.
 */
export function verifyPlaceholderHmac(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature?.startsWith("sha256=") || !secret) return false;
  const suppliedHex = signature.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const supplied = Buffer.from(suppliedHex, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
