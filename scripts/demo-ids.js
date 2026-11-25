/**
 * Why 64-bit IDs in JSON webhooks need care in JavaScript.
 * Runs offline: no Xsolla account needed.
 */
import { parseJson, stringifyJson } from "../src/json.js";

const first = '{"notification_type":"order_paid","order":{"id":9007199254740993}}';
const second = '{"notification_type":"order_paid","order":{"id":9007199254740992}}';

console.log("Two different orders arrive: IDs 9007199254740993 and 9007199254740992.\n");

const a = JSON.parse(first).order.id;
const b = JSON.parse(second).order.id;
console.log("With JSON.parse:");
console.log(`  first order ID:  ${a}`);
console.log(`  second order ID: ${b}`);
console.log(`  same ID? ${a === b}. An exactly-once check keyed on this ID would skip the second order.\n`);

const c = parseJson(first).order.id;
const d = parseJson(second).order.id;
console.log("With parseJson (src/json.js):");
console.log(`  first order ID:  ${c}`);
console.log(`  second order ID: ${d}`);
console.log(`  same ID? ${c === d}.\n`);

console.log(`Written back out: ${stringifyJson(parseJson(first))}`);
console.log(`Largest safe JavaScript integer: ${Number.MAX_SAFE_INTEGER}`);
