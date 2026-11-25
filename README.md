# Xsolla integration kit

A small Node.js reference for selling an item through Xsolla, written to be read as much as run. It covers the server side of a purchase from start to finish:

- creating a payment token on your server and opening the sandbox payment UI
- receiving signed webhooks and answering each one the way Xsolla expects
- granting items exactly once, however many times a webhook arrives, and taking them back on a refund
- diagnosing the errors you meet along the way, using Xsolla's real answers ([TROUBLESHOOTING.md](TROUBLESHOOTING.md))

It has no dependencies: Node 22.9 or later and nothing else. Everything below was run against a real Xsolla sandbox project in November 2026.

## What the sandbox run showed

| Step | What Xsolla did |
| --- | --- |
| Create the test items (`npm run seed`) | Created all three. A second run gets `422`, code `4002` "Item ... exist" for each, which the script reports and moves past. |
| Payment token for an enabled item | `201` with a token and an `order_id`, such as `800504023` |
| Token for a missing SKU, a disabled item, or an item hidden from the store | The same `422`, code `1455` "Cart is empty" for all three. Only the admin item lookup tells them apart. |
| Token for a good item plus a missing one | `201`, no error. The missing item is dropped without warning, and the cart shows only the good one. |
| Token with no items | `422`, code `1102` "Unprocessable Entity" |
| Token with a wrong API key, or a key from another project | The same `401`, code `1501` "Authorization failed: Invalid authorization token" |
| Unsigned request to `/webhooks` | `400 INVALID_SIGNATURE` from the kit. Nothing changed. |
| Live purchase as `player-1`, paid with a test card | `user_validation` four times, all answered `204`, then `order_paid` once: granted. Inventory: `kit-demo-pass x 1`. |
| Live purchase as `stranger` | The kit answered `user_validation` with `400 INVALID_USER`. The payment UI then refused to take payment: "A valid User ID is required ... Error 1205". |
| Refund of the paid order in Publisher Account | `order_canceled` once: revoked. Inventory back to nothing, and the order stays on record as canceled, so it can't be granted again. |

## Run it

You need Node 22.9 or later and a free [Xsolla Publisher Account](https://publisher.xsolla.com). Webhooks also need an HTTPS tunnel, such as Cloudflare's [cloudflared](https://github.com/cloudflare/cloudflared).

### 1. Set up a project in Xsolla

1. Create a project in Publisher Account.
2. **Project settings > API keys > Create API key.** Copy the key straight away: it's shown only once.
3. **Project settings > Webhooks > Secret keys > Add key.** Copy this one straight away too.

### 2. Configure the kit

```sh
cp .env.example .env
```

Fill in `XSOLLA_PROJECT_ID` (the ID next to your project's name), `XSOLLA_API_KEY` and `XSOLLA_WEBHOOK_SECRET`. The file is git-ignored. Keep both secrets on the server: never in a game client or a web page.

### 3. Try the API, no webhooks needed

```sh
npm run seed              # creates kit-demo-pass, kit-demo-disabled and kit-demo-hidden
npm run demo:empty-cart   # four checkouts that fail on purpose, then a diagnosis of each SKU
```

### 4. Receive webhooks

Xsolla only sends webhooks to an HTTPS address, so start a tunnel to the kit's port:

```sh
cloudflared tunnel --url http://localhost:3000
```

Then:

1. In **Project settings > Webhooks**, set **Webhook server** to `https://<your-tunnel>/webhooks` and press **Enable webhooks**.
2. Start the kit with `npm start` and open http://localhost:3000.
3. Buy as `player-1` and pay with Xsolla's [test card](https://developers.xsolla.com/doc/pay-station/testing/test-cards/) `4242 4242 4242 4242`, expiry `12/40`, any CVV.
4. Watch the terminal: `user_validation`, then `order_paid`. Refresh the store page to see the item.
5. To see `order_canceled`, refund the payment in **Player support > Transaction search** (the **•••** menu, then **Refund**).

A quick tunnel gets a new address every time it starts, so update the **Webhook server** field when it does.

### Without an Xsolla account

```sh
npm test               # signatures, exactly-once grants and ID handling
npm run demo:ids       # why 64-bit IDs need care in JavaScript
npm run demo:webhooks  # replays signed webhooks to a running `npm start`
```

For the last one, any value in `XSOLLA_WEBHOOK_SECRET` will do, as long as the kit and the replay use the same one.

## How it handles webhooks

Every decision here follows Xsolla's documented behaviour, and the live run above confirmed it.

- **Signature first, over the raw bytes.** Xsolla sends `Authorization: Signature <sha1 of the raw body followed by your secret>`. The kit hashes the bytes exactly as they arrived and compares in constant time. Parsing the JSON and serialising it again changes the bytes, so the signature would never match.
- **`user_validation` is a gate.** Xsolla never resends it, and no payment webhooks follow a rejection, so the kit answers `204` only for players that exist (the player is `user.id` here). It arrived four times during one purchase, so keep this handler read-only.
- **`order_paid` grants once per `order.id`.** Here the player is `user.external_id`, not `user.id`. A repeated delivery gets `204` and changes nothing.
- **`order_canceled` takes back what the order granted, once.** If a cancellation arrives before its payment, the kit records it, so a late `order_paid` can't grant afterwards.
- **Status codes are chosen on purpose.**
  - `204` when the webhook is handled, including repeats and types the kit doesn't act on, so they never hold up the webhooks that follow.
  - `400` with `{"error":{"code","message"}}` only for a genuinely bad request: a wrong signature, a body that isn't JSON, an unknown player or missing fields. If automatic refunds are switched on for your project, Xsolla [refunds the player](https://developers.xsolla.com/webhooks/combined-webhooks/successful-order-payment) when `order_paid` gets a 4xx.
  - `500` when something fails on our side, so Xsolla [retries](https://developers.xsolla.com/webhooks/sending-responses-to-webhook) (up to 20 attempts within 12 hours) rather than giving up.
- **The return page is display only.** Items are granted by `order_paid`, never by the redirect back to your site. A player can close the tab before it happens, and anyone can open `/return` by hand.
- **IDs stay exact.** Xsolla's API types its IDs as 64-bit integers, and `JSON.parse` rounds whole numbers above 2^53. The sandbox IDs seen here have 9 or 10 digits, so this is a safeguard rather than a live bug: `src/json.js` keeps big IDs exact, and `npm run demo:ids` shows two different orders colliding without it.

## Files

| Path | What it does |
| --- | --- |
| `src/server.js` | The test store page, the checkout redirect, the webhook endpoint and the return page |
| `src/xsolla.js` | The Xsolla API calls, and `XsollaApiError`, which keeps the `transactionId` support asks for |
| `src/webhooks.js` | The webhook handler: a plain function, so it's tested without a server |
| `src/signature.js` | The signature check |
| `src/store.js` | A small file-backed stand-in for your game's database |
| `src/json.js` | JSON parsing that keeps 64-bit integers exact |
| `src/config.js` | Settings from `.env` |
| `scripts/` | The seed, the demos and the webhook replay |
| `test/` | Tests, run with Node's built-in test runner |

## Before you go live

- Replace `src/store.js` with your database: a unique key on the order ID, with the grant and the order record written in one transaction.
- Answer webhooks quickly. Xsolla recommends under 3 seconds, so record the order, return `204`, and do slow work afterwards.
- Check `order.mode`. Sandbox orders arrive as `"sandbox"`, and real ones as `"default"`. Don't grant real items for sandbox orders in production.
- Turn off `sandbox` in the token request (`createPaymentToken` in `src/xsolla.js`) only once your licensing agreement with Xsolla is signed. Until then, only sandbox payments work.

## Licence

MIT. Made by Aliff.
