# Troubleshooting

Each entry starts from what you see, then explains why it happens, how to tell the possible causes apart, and how to fix it. The outputs are real: they come from running this kit against Xsolla's sandbox in November 2026.

A pattern worth knowing up front: **Xsolla often gives several different causes the same error.** Three different catalog problems all come back as "Cart is empty", and a wrong key looks exactly like a key for the wrong project. The fix is never to guess from the message. Look the thing up, and the answer is usually one field away.

**Before you contact Xsolla support:** every error from Xsolla's API carries a `transactionId`. The kit's `XsollaApiError` keeps it (`error.summary()`), so log it and quote it in your ticket.

## Contents

- [Payment token: "Cart is empty" (422, code 1455)](#payment-token-cart-is-empty-422-code-1455)
- [The cart is missing an item (no error)](#the-cart-is-missing-an-item-no-error)
- [Payment token: "Unprocessable Entity" (422, code 1102)](#payment-token-unprocessable-entity-422-code-1102)
- [Payment token: "Authorization failed" (401, code 1501)](#payment-token-authorization-failed-401-code-1501)
- [Creating an item: "Item ... exist" (422, code 4002)](#creating-an-item-item--exist-422-code-4002)
- [Refund API: 401 with an empty body](#refund-api-401-with-an-empty-body)
- [The player sees "A valid User ID is required ... Error 1205"](#the-player-sees-a-valid-user-id-is-required--error-1205)
- [Webhooks never arrive](#webhooks-never-arrive)
- [Every webhook gets INVALID_SIGNATURE](#every-webhook-gets-invalid_signature)
- [The payment succeeded, but the item never arrived](#the-payment-succeeded-but-the-item-never-arrived)
- [user_validation arrives several times for one purchase](#user_validation-arrives-several-times-for-one-purchase)
- [The player paid in a different currency, with different tax](#the-player-paid-in-a-different-currency-with-different-tax)
- [An order was granted twice, or two orders were treated as one](#an-order-was-granted-twice-or-two-orders-were-treated-as-one)

## Payment token: "Cart is empty" (422, code 1455)

**What you see.** Creating a payment token fails with:

```
{
  status: 422,
  errorCode: 1455,
  errorMessage: '[0401-1455]: Cart is empty',
  transactionId: '3d165bdcf636e4d8a3d945b80d6a759c'
}
```

**Why.** None of the items you asked for can be sold, so the cart Xsolla builds from your request is empty. (If only **some** of them can't be sold, there's no error at all: see [the next entry](#the-cart-is-missing-an-item-no-error).) `npm run demo:empty-cart` reproduces three different causes, and Xsolla gives the same answer to all of them:

| What the request asked for | Xsolla's answer |
| --- | --- |
| An SKU that isn't in the project's catalog | `422`, code `1455`, "Cart is empty" |
| An item that exists but is disabled (`is_enabled: false`) | `422`, code `1455`, "Cart is empty" |
| An item that is enabled but not shown in the store (`is_show_in_store: false`) | `422`, code `1455`, "Cart is empty" |

The third one surprises people: `is_show_in_store` isn't just about display. An enabled item with it switched off can't be bought through a payment token either. We retried it minutes later to rule out a cache delay, and got the same answer.

**How to tell which.** Look each SKU up as an admin (`GET /v2/project/{project_id}/admin/items/virtual_items/sku/{sku}`, or `getVirtualItem` in `src/xsolla.js`). The demo does this for you:

```
kit-demo-missing: not found in the catalog. {
  status: 404,
  errorCode: 4001,
  errorMessage: "[0401-4001]: Item with sku = 'kit-demo-missing' not found",
  ...
}
kit-demo-disabled: {
  is_enabled: false,
  is_show_in_store: false,
  periods: [],
  regions: [],
  limits: { per_user: null, per_item: null, recurrent_schedule: null }
}
kit-demo-hidden: {
  is_enabled: true,
  is_show_in_store: false,
  ...
}
```

- `404`, code `4001`: the SKU isn't in **this** project. Check the spelling, and check that the project ID in your token request is the project that holds the item. Catalogs are per project.
- `is_enabled: false`: the item is switched off.
- `is_show_in_store: false`: the item is hidden, which also stops it selling.
- If both are `true`, check the other availability settings the same lookup returns: `periods` (sales periods), `regions` (where it may be sold) and `limits` (per-user or overall purchase limits). This kit doesn't reproduce those cases.

**Fix.** Correct the SKU or project ID, or switch the item on and show it in the store, in Publisher Account or through the admin API.

## The cart is missing an item (no error)

**What you see.** You ask for several items, the token request succeeds, but the payment UI shows fewer. We requested one `kit-demo-pass` and two of `kit-demo-missing`, an SKU that doesn't exist. Xsolla answered `201` with order `800509369`, and the payment UI showed a cart with only "Kit demo pass", for RM8.70. The same happened with a disabled item in place of the missing one.

**Why.** Xsolla drops items it can't sell and builds the cart from what's left. It only fails, with "Cart is empty", when nothing is left.

**How to tell.** Compare the cart with what you asked for. Before payment, the payment UI shows the cart. After payment, the `items` array in `order_paid` lists exactly what the player paid for.

**Fix.**

- Grant from the `items` in `order_paid`, never from what your checkout asked for. The kit does this, so a dropped item is never granted.
- If a partial cart is unacceptable, for example a bundle that only makes sense whole, look each SKU up before you create the token (`getVirtualItem` in `src/xsolla.js`), and stop if any can't be sold.

## Payment token: "Unprocessable Entity" (422, code 1102)

**What you see.**

```
{
  status: 422,
  errorCode: 1102,
  errorMessage: '[0401-1102]: Unprocessable Entity',
  ...
}
```

**Why.** The request body itself didn't pass validation, before Xsolla even looked at the catalog. The demo triggers it by sending `purchase.items` as an empty array.

**Fix.** Check the body against the API reference. Every request needs at least one item with a `sku` and a `quantity`. Compare this with "Cart is empty", where the body is valid but the items can't be sold.

## Payment token: "Authorization failed" (401, code 1501)

**What you see.**

```
{
  status: 401,
  errorCode: 1501,
  errorMessage: '[0401-1501]: Authorization failed: Invalid authorization token',
  ...
}
```

**Why.** The token request, like the kit's other admin calls, uses HTTP Basic auth with the pair `project_id:api_key`, and Xsolla rejected the pair. We got exactly this answer for two different mistakes:

- a wrong API key
- a correct API key with a different project's ID

**How to tell which, and fix.**

- Check that `XSOLLA_PROJECT_ID` is the project the key was created in (**Project settings > API keys** lists them per project).
- Look for spaces or quote marks picked up while pasting the key into `.env`.
- If the key was created as **Temporary**, check it hasn't expired.
- If none of these is the problem, create a new key: Xsolla shows a key only once, so a lost key can't be recovered.

## Creating an item: "Item ... exist" (422, code 4002)

**What you see.** Running `npm run seed` a second time:

```
kit-demo-pass: not created. {
  status: 422,
  errorCode: 4002,
  errorMessage: '[0401-4002]: Item with sku = kit-demo-pass and projectId = 324005 exist.',
  ...
}
```

**Why.** SKUs are unique within a project, and that one is taken.

**Fix.** Nothing, if the item is already the one you want: the seed treats this as done. To change an existing item, update it rather than creating it again.

## Refund API: 401 with an empty body

**What you see.** `PUT https://api.xsolla.com/merchant/v2/merchants/{merchant_id}/reports/transactions/{transaction_id}/refund` answers `401 Unauthorized` with no body at all.

**Why.** The refund call works at company level: its path has no project ID. Xsolla's [reference](https://developers.xsolla.com/api/pay-station/refund/request-refund) asks for a key that's valid for all the company's projects. A key created under **Project settings > API keys** doesn't qualify.

**Fix.** Use a company-wide API key with your merchant ID, or refund the payment by hand in Publisher Account: **Player support > Transaction search**, the transaction's **•••** menu, then **Refund**. We refunded our test payment the second way. The transaction then showed as **Canceled**, and the kit logged:

```
webhook 204: order_canceled 800504023: revoked
```

## The player sees "A valid User ID is required ... Error 1205"

**What you see.** The payment UI opens and lists payment methods, but taking payment fails with:

> A valid User ID is required to complete this transaction. Please make sure you input your details correctly and try again. ... Error 1205

At the same time, the kit's log shows:

```
checkout: order 800505353 for stranger
webhook 400: user_validation: stranger rejected
```

**Why.** Your server answered `user_validation` with an error. The kit does this on purpose for its `stranger` player. Xsolla [doesn't resend](https://developers.xsolla.com/webhooks/sending-responses-to-webhook) `user_validation`, and it sends no payment webhooks after a rejection. A `5xx` answer or no answer at all counts as a rejection too.

**How to tell, and fix.**

- Find the `user_validation` request in your log and see which user ID Xsolla asked about. It's `user.id`: the `user.id.value` you put in the token request.
- If that player should exist, your lookup is wrong, or it failed or timed out. Keep this handler fast and read-only.
- If you see no `user_validation` request at all, Xsolla can't reach your webhook address: see the next entry.

## Webhooks never arrive

Work through these in order:

1. **Are webhooks enabled?** In **Project settings > Webhooks**, the **Enable webhooks** button stays greyed out until the **Webhook server** field has an address. Once enabled, a testing section appears below it, and you can send test webhooks from there.
2. **Is the address HTTPS, and reachable from the internet?** Xsolla only sends to HTTPS, and it can't reach `localhost`. While testing, use a tunnel, for example `cloudflared tunnel --url http://localhost:3000`, and enter `https://<tunnel-address>/webhooks`.
3. **Did the tunnel's address change?** A quick tunnel gets a new address every time it starts. Update the **Webhook server** field to match.
4. **Did the payment succeed?** `order_paid` and `order_canceled` aren't sent for payments that failed or were never completed.

A project sends webhooks to one address only. To test, point it at your test address first, then switch to the real one.

## Every webhook gets INVALID_SIGNATURE

**What you see.** Your endpoint answers every webhook with `400` and `{"error":{"code":"INVALID_SIGNATURE",...}}`.

**Why.** Xsolla signs each webhook as `Authorization: Signature <sha1 of the raw body followed by your secret>`, in lowercase hex. The usual causes, most common first:

1. **The body was parsed and serialised again before hashing.** Any framework that parses JSON for you hands you an object, not the bytes Xsolla signed. Hash the raw body exactly as it arrived. In Express, for example, use `express.raw()` on this route. `test/signature.test.js` shows a body re-serialised with different spacing failing the check.
2. **The wrong secret.** Use the key marked **Active** under **Project settings > Webhooks > Secret keys**: a project can have several, but only one signs. Xsolla shows a secret only once, when you create it, so if you've lost it, add a new key and make it active.
3. **The secret picked up spaces or quote marks** when it was pasted into `.env`.

The kit checks the signature before anything else and compares in constant time. Its live run verified every one of Xsolla's real webhooks, and refused an unsigned request with `400 INVALID_SIGNATURE`.

## The payment succeeded, but the item never arrived

**Check the log for `order_paid`, and what you answered.**

- **Nothing arrived:** see "Webhooks never arrive".
- **You answered `5xx`, or nothing in time:** Xsolla [retries](https://developers.xsolla.com/webhooks/sending-responses-to-webhook): 2 attempts at 5-minute intervals, then 7 at 15 minutes, then 10 at 60 minutes. That's up to 20 attempts within 12 hours, so fix the fault and the item arrives on the next attempt.
- **You answered `4xx`:** Xsolla doesn't retry. If automatic refunds are switched on for your project, it [refunds the player](https://developers.xsolla.com/webhooks/combined-webhooks/successful-order-payment). So answer `4xx` only when you truly mean to reject the order.
- **You answered `204`, but granted to the wrong player:** in `order_paid` the player is `user.external_id`, while in `user_validation` it's `user.id`.

Also check that you grant items when `order_paid` arrives, not when the player comes back to your site. The redirect can be skipped by closing the tab, and anyone can open a return URL by hand. In this kit the return page is display only.

## user_validation arrives several times for one purchase

**What you see.** One purchase, four checks:

```
checkout: order 800504023 for player-1
webhook 204: user_validation: player-1 accepted
webhook 204: user_validation: player-1 accepted
webhook 204: user_validation: player-1 accepted
webhook 204: user_validation: player-1 accepted
webhook 204: order_paid 800504023 (sandbox): granted
```

**Why.** This is expected. Xsolla checks the player at several stages of the payment process.

**Fix.** Nothing to fix, as long as the handler only looks the player up. Anything it creates or changes, it will do several times.

## The player paid in a different currency, with different tax

**What you see.** The kit requests every token with `country: "MY"`. Before a card is entered, the payment UI shows what you'd expect: "US$1.99 = RM8.70", including 6% tax. But the receipt for the paid test order read "US$1.99 = £1.62", including UK VAT at 20%.

**Why.** That payment was made with the test card `4242 4242 4242 4242`, which Xsolla lists as a UK card. The tax and currency on the receipt followed the card's country, not the country in the token request.

**Fix.** To test pricing and tax for a country, set that country in the token request **and** pay with a test card issued there. Xsolla's [test card list](https://developers.xsolla.com/doc/pay-station/testing/test-cards/) can be sorted by country. US cards such as `4111 1111 1111 1111` also ask for a ZIP code, and any valid one, such as `12345`, works.

## An order was granted twice, or two orders were treated as one

**Granted twice.** Xsolla can deliver the same webhook more than once, for example after a timeout or a `5xx`. Record each `order.id` you've handled, and treat a repeat as done: answer `204` and change nothing. In production, put a unique key on the order ID and write the grant and the order record in one transaction. `test/webhooks.test.js` delivers the same `order_paid` three times and checks the item arrives once.

**Two orders treated as one.** Xsolla's API types its IDs as 64-bit integers. JavaScript's `JSON.parse` rounds whole numbers above 2^53 (9007199254740991), so two different large IDs can come out equal, and an exactly-once check would then skip a real order. The IDs seen in this sandbox have 9 or 10 digits, so this hasn't happened yet. `src/json.js` parses IDs exactly anyway, and `npm run demo:ids` shows the collision it prevents:

```
With JSON.parse:
  first order ID:  9007199254740992
  second order ID: 9007199254740992
  same ID? true. An exactly-once check keyed on this ID would skip the second order.
```
