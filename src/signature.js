import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Xsolla signs every webhook: the Authorization header holds "Signature <hex>", where <hex> is the
 * lowercase SHA-1 of the raw request body followed by your secret key.
 *
 * Hash the bytes exactly as they arrived. Parsing the JSON and serialising it again changes them,
 * and the signature never matches.
 */
export function verifySignature(rawBody, authorizationHeader, secretKey) {
  const provided = String(authorizationHeader ?? "").replace(/^Signature\s+/i, "").trim();
  const expected = sha1Hex(rawBody, secretKey);
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  // Compare in constant time, so the check doesn't leak how much of a guess was right.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Signs a body the way Xsolla does: for tests, and for replaying webhooks locally. */
export function signBody(rawBody, secretKey) {
  return `Signature ${sha1Hex(rawBody, secretKey)}`;
}

function sha1Hex(rawBody, secretKey) {
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(rawBody), Buffer.from(secretKey, "utf8")]))
    .digest("hex");
}
