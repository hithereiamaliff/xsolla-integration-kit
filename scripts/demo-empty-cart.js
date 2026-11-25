/**
 * Reproduces failed payment-token requests on purpose, then diagnoses them the way support would.
 *
 *   1. Ask for a token with an SKU that doesn't exist, a disabled item, an enabled item that isn't
 *      shown in the store, and no items at all.
 *   2. Print exactly what Xsolla answers, including the transactionId support will ask for.
 *   3. Look up each SKU as an admin and print the fields that decide whether it can be sold.
 */
import { credentialsFromEnv } from "../src/config.js";
import { createPaymentToken, getVirtualItem, XsollaApiError } from "../src/xsolla.js";

const credentials = credentialsFromEnv();

const cases = [
  { label: "An SKU that isn't in the catalog", items: [{ sku: "kit-demo-missing", quantity: 1 }] },
  { label: "A disabled item", items: [{ sku: "kit-demo-disabled", quantity: 1 }] },
  { label: "An enabled item that isn't shown in the store", items: [{ sku: "kit-demo-hidden", quantity: 1 }] },
  { label: "No items at all", items: [] },
];

for (const { label, items } of cases) {
  console.log(`\n== ${label}`);
  try {
    const { order_id: orderId } = await createPaymentToken(credentials, { playerId: "player-1", country: "MY", items });
    console.log(`Token created (order ${orderId}). Xsolla accepted this request.`);
  } catch (error) {
    if (!(error instanceof XsollaApiError)) throw error;
    console.log("Xsolla answered:", error.summary());
  }
}

console.log("\n== Diagnosis: can each SKU be sold?");
for (const sku of ["kit-demo-missing", "kit-demo-disabled", "kit-demo-hidden"]) {
  try {
    const item = await getVirtualItem(credentials, sku);
    console.log(`${sku}:`, {
      is_enabled: item.is_enabled, // false: can't be bought at all
      is_show_in_store: item.is_show_in_store, // false: can't be bought either, even when enabled
      periods: item.periods, // outside every sales period: not sellable now
      regions: item.regions, // non-empty: only sellable in those regions
      limits: item.limits, // a per-user or global limit can run out
    });
  } catch (error) {
    if (!(error instanceof XsollaApiError)) throw error;
    console.log(`${sku}: not found in the catalog.`, error.summary());
  }
}
