/**
 * The kit's web server: a one-item test store, the checkout redirect and the webhook endpoint.
 *
 *   GET  /          the store page, with each test player's inventory
 *   POST /checkout  creates a payment token and sends the player to the sandbox payment UI
 *   POST /webhooks  Xsolla's webhooks (needs a public HTTPS address: a tunnel while testing)
 *   GET  /return    where the payment UI sends the player afterwards
 *
 * Items arrive through the order_paid webhook, never through the redirect: a player can close the
 * tab before it happens, and anyone can open /return by hand.
 */
import { createServer } from "node:http";
import { join } from "node:path";
import { credentialsFromEnv, requireEnv, testSku } from "./config.js";
import { Store } from "./store.js";
import { handleWebhook } from "./webhooks.js";
import { createPaymentToken, paymentUiUrl, XsollaApiError } from "./xsolla.js";

const PORT = Number(process.env.PORT ?? 3000);
const PLAYERS = ["player-1", "player-2"];
const MAX_BODY_BYTES = 1024 * 1024;

const secretKey = requireEnv("XSOLLA_WEBHOOK_SECRET");
const store = new Store(join(process.cwd(), "data", "store.json"));

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; background: #f7f7f8; color: #18181b; font: 16px/1.55 system-ui, sans-serif; }
  main { max-width: 620px; margin: 0 auto; padding: 40px 16px; }
  h1 { font-size: 28px; margin: 0 0 8px; }
  p, li { color: #3f3f46; }
  form { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 20px 0; }
  select, button { font: inherit; padding: 8px 12px; border-radius: 8px; border: 1px solid #d4d4d8; background: #fff; }
  button { background: #ff005b; border-color: #ff005b; color: #fff; font-weight: 600; cursor: pointer; }
  pre { background: #fff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 12px; overflow-x: auto; }
  code { font-size: 0.92em; }
</style>
</head>
<body><main>${content}</main></body>
</html>`;
}

function inventoryList() {
  return PLAYERS.map((player) => {
    const owned = Object.entries(store.inventory(player)).filter(([, quantity]) => quantity > 0);
    const text = owned.length ? owned.map(([sku, quantity]) => `${escapeHtml(sku)} × ${quantity}`).join(", ") : "nothing yet";
    return `<li><strong>${player}</strong>: ${text}</li>`;
  }).join("");
}

function storePage() {
  return page(
    "Xsolla integration kit",
    `<h1>Xsolla integration kit</h1>
    <p>A one-item test store. Checkout opens Xsolla's sandbox payment UI, where test cards work. The item arrives through the <code>order_paid</code> webhook, not the redirect back here.</p>
    <form method="post" action="/checkout">
      <label>Buy as
        <select name="player">
          ${PLAYERS.map((p) => `<option>${p}</option>`).join("")}
          <option value="stranger">stranger (not a player, so user_validation says no)</option>
        </select>
      </label>
      <button type="submit">Buy ${escapeHtml(testSku())}</button>
    </form>
    <h2>Inventory</h2>
    <ul>${inventoryList()}</ul>`,
  );
}

async function checkout(req, res) {
  const form = new URLSearchParams((await readBody(req)).toString("utf8"));
  const playerId = form.get("player") || PLAYERS[0];
  const publicUrl = process.env.PUBLIC_URL?.trim() || `http://localhost:${PORT}`;
  let credentials;
  try {
    credentials = credentialsFromEnv();
  } catch (error) {
    return send(res, 500, page("Not set up yet", `<h1>Not set up yet</h1><p>${escapeHtml(error.message)}</p><p><a href="/">Back to the store</a></p>`));
  }
  try {
    const { token, order_id: orderId } = await createPaymentToken(credentials, {
      playerId,
      country: "MY", // Sets the payment currency. Or send the player's IPv4 in X-User-Ip.
      items: [{ sku: testSku(), quantity: 1 }],
      returnUrl: `${publicUrl}/return`,
    });
    console.log(`checkout: order ${orderId} for ${playerId}`);
    res.writeHead(303, { Location: paymentUiUrl(token) });
    res.end();
  } catch (error) {
    if (!(error instanceof XsollaApiError)) throw error;
    console.log("checkout failed:", error.summary());
    send(
      res,
      502,
      page("Checkout failed", `<h1>Checkout failed</h1><p>Xsolla said:</p><pre>${escapeHtml(JSON.stringify(error.summary(), null, 2))}</pre><p><a href="/">Back to the store</a></p>`),
    );
  }
}

async function webhooks(req, res) {
  const rawBody = await readBody(req); // The raw bytes: the signature is over these, not re-serialised JSON.
  const result = handleWebhook({ rawBody, authorization: req.headers.authorization, secretKey, store });
  console.log(`webhook ${result.status}: ${result.summary}`);
  if (result.body) {
    res.writeHead(result.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result.body));
  } else {
    res.writeHead(result.status);
    res.end();
  }
}

function returnPage(url) {
  // The payment UI adds user_id, invoice_id and status. Treat them as display only.
  const status = url.searchParams.get("status") ?? "unknown";
  return page(
    "Back from checkout",
    `<h1>Back from checkout</h1>
    <p>The payment UI reported: <strong>${escapeHtml(status)}</strong>. That's for display only: the item is granted when the <code>order_paid</code> webhook arrives, which can be a moment later.</p>
    <h2>Inventory</h2>
    <ul>${inventoryList()}</ul>
    <p><a href="/">Back to the store</a></p>`,
  );
}

function send(res, status, html) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (req.method === "GET" && url.pathname === "/") return send(res, 200, storePage());
    if (req.method === "POST" && url.pathname === "/checkout") return await checkout(req, res);
    if (req.method === "POST" && url.pathname === "/webhooks") return await webhooks(req, res);
    if (req.method === "GET" && url.pathname === "/return") return send(res, 200, returnPage(url));
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Something went wrong");
  }
});

server.listen(PORT, () => console.log(`Xsolla integration kit on http://localhost:${PORT}`));
