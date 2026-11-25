/**
 * Replays signed webhooks to the kit running on your machine (npm start), so you can see each
 * response without making a payment. Signs them the way Xsolla does, with your webhook secret.
 */
import { requireEnv, testSku } from "../src/config.js";
import { stringifyJson } from "../src/json.js";
import { signBody } from "../src/signature.js";

const url = process.env.WEBHOOK_URL || `http://localhost:${process.env.PORT ?? 3000}/webhooks`;
const secret = requireEnv("XSOLLA_WEBHOOK_SECRET");

async function deliver(label, payload, { signed = true } = {}) {
  const raw = stringifyJson(payload);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: signed ? signBody(raw, secret) : "Signature 0000" },
    body: raw,
  });
  const text = await response.text();
  console.log(`${label.padEnd(42)} ${response.status}${text ? ` ${text}` : ""}`);
}

// A 64-bit order ID on purpose: past JavaScript's safe range, kept exact by src/json.js.
const order = { id: 9007199254740993n, mode: "sandbox", status: "paid", currency: "USD", amount: "1.99" };
const paid = {
  notification_type: "order_paid",
  items: [{ sku: testSku(), type: "virtual_good", quantity: 1, amount: "1.99" }],
  order,
  user: { external_id: "player-1" },
};

console.log(`Sending to ${url}\n`);
await deliver("user_validation, a known player", { notification_type: "user_validation", user: { id: "player-1" } });
await deliver("user_validation, a stranger", { notification_type: "user_validation", user: { id: "stranger" } });
await deliver("order_paid", paid);
await deliver("order_paid again (a retry)", paid);
await deliver("order_paid with a wrong signature", paid, { signed: false });
await deliver("order_canceled", { ...paid, notification_type: "order_canceled", order: { ...order, status: "canceled" } });
console.log("\nOpen the store page to see player-1's inventory.");
