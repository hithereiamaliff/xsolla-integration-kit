/**
 * The Xsolla API calls the kit uses, plus the payment UI link.
 * Admin calls authenticate with HTTP Basic auth (project ID and API key), so they run server side only.
 */
import { API_BASE, PAYMENT_UI } from "./config.js";
import { parseJson } from "./json.js";

/** An error response from Xsolla, keeping the fields support asks for. */
export class XsollaApiError extends Error {
  constructor(status, body) {
    const details = body && typeof body === "object" ? body : { errorMessage: String(body ?? "") };
    super(`Xsolla API returned ${status}: ${details.errorMessage ?? JSON.stringify(details)}`);
    this.name = "XsollaApiError";
    this.status = status;
    this.errorCode = details.errorCode;
    this.errorMessage = details.errorMessage;
    this.transactionId = details.transactionId; // Quote this when you contact Xsolla support.
    this.body = body;
  }

  /** The fields worth logging or pasting into a ticket. */
  summary() {
    return { status: this.status, errorCode: this.errorCode, errorMessage: this.errorMessage, transactionId: this.transactionId };
  }
}

async function call({ projectId, apiKey }, method, path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${projectId}:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = text || null;
  try {
    data = text ? parseJson(text) : null;
  } catch {
    // Not JSON: keep the raw text for the error.
  }
  if (!response.ok) throw new XsollaApiError(response.status, data);
  return data;
}

/**
 * Creates an order and a payment token for it. Returns { token, order_id }.
 * The country sets the payment currency. If you don't know it, send the player's IPv4 address in an
 * X-User-Ip header instead.
 */
export function createPaymentToken(credentials, { playerId, country, items, sandbox = true, returnUrl, language = "en" }) {
  return call(credentials, "POST", `/v3/project/${credentials.projectId}/admin/payment/token`, {
    sandbox,
    user: { id: { value: String(playerId) }, country: { value: country } },
    purchase: { items },
    settings: { language, ...(returnUrl ? { return_url: returnUrl } : {}) },
  });
}

/** The link that opens the payment UI for a token. */
export function paymentUiUrl(token, { sandbox = true } = {}) {
  return `${sandbox ? PAYMENT_UI.sandbox : PAYMENT_UI.live}?token=${encodeURIComponent(token)}`;
}

/** Creates a virtual item in the project's catalog. */
export function createVirtualItem(credentials, item) {
  return call(credentials, "POST", `/v2/project/${credentials.projectId}/admin/items/virtual_items`, item);
}

/** Gets a virtual item as an admin sees it, including availability, regions, periods and limits. */
export function getVirtualItem(credentials, sku) {
  return call(credentials, "GET", `/v2/project/${credentials.projectId}/admin/items/virtual_items/sku/${encodeURIComponent(sku)}`);
}
