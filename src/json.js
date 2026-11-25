/**
 * JSON that keeps 64-bit IDs exact.
 *
 * JavaScript numbers are exact only up to 2^53 - 1 (Number.MAX_SAFE_INTEGER, 9007199254740991).
 * JSON.parse silently rounds anything bigger: 9007199254740993 becomes 9007199254740992, so two
 * different orders can end up with the same ID. Node 22 gives JSON.parse's reviver each value's
 * original text (context.source), so whole numbers past the safe range can become BigInt, with no
 * extra package. JSON.rawJSON writes them back out as the same digits.
 */

/** JSON.parse, except that whole numbers past the safe range become BigInt. */
export function parseJson(text) {
  return JSON.parse(text, (key, value, context) =>
    typeof value === "number" && !Number.isSafeInteger(value) && /^-?\d+$/.test(context?.source ?? "")
      ? BigInt(context.source)
      : value,
  );
}

/** JSON.stringify, except that BigInt values are written as plain digits, the way they arrived. */
export function stringifyJson(value, space) {
  return JSON.stringify(value, (key, v) => (typeof v === "bigint" ? JSON.rawJSON(v.toString()) : v), space);
}
