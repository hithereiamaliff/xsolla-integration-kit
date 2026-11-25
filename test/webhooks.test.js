import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { stringifyJson } from "../src/json.js";
import { signBody } from "../src/signature.js";
import { Store } from "../src/store.js";
import { handleWebhook } from "../src/webhooks.js";

const SECRET = "test-secret";
const quiet = { error() {} };

const newStore = () => new Store(join(mkdtempSync(join(tmpdir(), "xsolla-kit-")), "store.json"));

function deliver(store, payload, { signature } = {}) {
  const rawBody = Buffer.from(stringifyJson(payload));
  return handleWebhook({ rawBody, authorization: signature ?? signBody(rawBody, SECRET), secretKey: SECRET, store, log: quiet });
}

const paid = (id, player = "player-1") => ({
  notification_type: "order_paid",
  items: [{ sku: "kit-demo-pass", type: "virtual_good", quantity: 1, amount: "1.99" }],
  order: { id, mode: "sandbox", status: "paid" },
  user: { external_id: player },
});

test("user_validation: 204 for a known player, 400 INVALID_USER for anyone else", () => {
  const store = newStore();
  assert.equal(deliver(store, { notification_type: "user_validation", user: { id: "player-1" } }).status, 204);
  const stranger = deliver(store, { notification_type: "user_validation", user: { id: "stranger" } });
  assert.equal(stranger.status, 400);
  assert.equal(stranger.body.error.code, "INVALID_USER");
});

test("a bad signature gets 400 INVALID_SIGNATURE and changes nothing", () => {
  const store = newStore();
  const result = deliver(store, paid(1), { signature: "Signature 0000" });
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, "INVALID_SIGNATURE");
  assert.deepEqual(store.inventory("player-1"), {});
});

test("order_paid grants once, however many times it arrives", () => {
  const store = newStore();
  for (let attempt = 0; attempt < 3; attempt++) assert.equal(deliver(store, paid(123456789)).status, 204);
  assert.deepEqual(store.inventory("player-1"), { "kit-demo-pass": 1 });
});

test("two orders whose IDs differ only past 2^53 are both granted", () => {
  const store = newStore();
  deliver(store, paid(9007199254740992n));
  deliver(store, paid(9007199254740993n));
  assert.deepEqual(store.inventory("player-1"), { "kit-demo-pass": 2 });
});

test("order_canceled takes the item back once, and blocks a late order_paid", () => {
  const store = newStore();
  deliver(store, paid(1));
  const cancel = (id) => deliver(store, { ...paid(id), notification_type: "order_canceled" });
  assert.equal(cancel(1).summary, "order_canceled 1: revoked");
  assert.equal(cancel(1).summary, "order_canceled 1: duplicate");
  assert.deepEqual(store.inventory("player-1"), { "kit-demo-pass": 0 });

  assert.equal(cancel(2).summary, "order_canceled 2: recorded"); // arrives before its payment
  assert.equal(deliver(store, paid(2)).summary, "order_paid 2 (sandbox): canceled");
  assert.deepEqual(store.inventory("player-1"), { "kit-demo-pass": 0 });
});

test("a failure on our side returns 500, so Xsolla retries instead of refunding", () => {
  const store = newStore();
  store.grant = () => {
    throw new Error("database unavailable");
  };
  assert.equal(deliver(store, paid(1)).status, 500);
});

test("an unknown notification type is acknowledged, so it never holds up the next one", () => {
  assert.equal(deliver(newStore(), { notification_type: "something_new" }).status, 204);
});

test("a body that isn't JSON gets 400 INVALID_PARAMETER", () => {
  const rawBody = Buffer.from("not json");
  const result = handleWebhook({ rawBody, authorization: signBody(rawBody, SECRET), secretKey: SECRET, store: newStore(), log: quiet });
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, "INVALID_PARAMETER");
});
