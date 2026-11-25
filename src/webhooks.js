/**
 * Handles one webhook from Xsolla: check the signature, then act on notification_type.
 * Returns { status, body, summary } so it can be tested without a server.
 *
 * How Xsolla reads the response:
 *   2xx                accepted.
 *   4xx + error body   rejected and not retried. A 4xx to order_paid can trigger an automatic
 *                      refund, so this kit sends one only for a genuinely bad request.
 *   5xx                a temporary problem on our side. Xsolla retries order_paid and
 *                      order_canceled (up to 20 attempts over 12 hours).
 */
import { parseJson } from "./json.js";
import { verifySignature } from "./signature.js";

const reject = (status, code, message, summary) => ({ status, body: { error: { code, message } }, summary });

export function handleWebhook({ rawBody, authorization, secretKey, store, log = console }) {
  if (!verifySignature(rawBody, authorization, secretKey)) {
    return reject(400, "INVALID_SIGNATURE", "Signature mismatch", "rejected: bad signature");
  }

  let event;
  try {
    event = parseJson(Buffer.from(rawBody).toString("utf8"));
  } catch {
    return reject(400, "INVALID_PARAMETER", "Body is not valid JSON", "rejected: not JSON");
  }
  const type = event?.notification_type;

  try {
    switch (type) {
      case "user_validation": {
        // A gate before payment. It's never retried, and no payment webhook follows a rejection,
        // so answer 204 only for players that really exist. The player is user.id here.
        const id = event.user?.id;
        return store.hasPlayer(id)
          ? { status: 204, summary: `user_validation: ${id} accepted` }
          : reject(400, "INVALID_USER", "User not found", `user_validation: ${id} rejected`);
      }

      case "order_paid": {
        // The fulfilment trigger. The player is user.external_id here, not user.id.
        const orderId = event.order?.id;
        const playerId = event.user?.external_id;
        if (orderId === undefined || !playerId || !Array.isArray(event.items)) {
          return reject(400, "INVALID_PARAMETER", "order.id, user.external_id and items are required", "order_paid: incomplete");
        }
        // Keyed on order.id, so a retry never grants twice.
        const outcome = store.grant(String(orderId), String(playerId), event.items, event.order.mode);
        return { status: 204, summary: `order_paid ${orderId} (${event.order.mode ?? "default"}): ${outcome}` };
      }

      case "order_canceled": {
        // A refund or chargeback: take back what this order granted, once.
        const orderId = event.order?.id;
        if (orderId === undefined) return reject(400, "INVALID_PARAMETER", "order.id is required", "order_canceled: incomplete");
        const outcome = store.revoke(String(orderId));
        return { status: 204, summary: `order_canceled ${orderId}: ${outcome}` };
      }

      default:
        // Acknowledge types this kit doesn't act on, so they never hold up the ones that follow.
        return { status: 204, summary: `${type ?? "unknown"}: acknowledged` };
    }
  } catch (error) {
    // Our side failed (storage, a bug), not the request: 5xx, so Xsolla retries instead of refunding.
    log.error?.(error);
    return { status: 500, summary: `${type}: failed on our side, Xsolla will retry` };
  }
}
