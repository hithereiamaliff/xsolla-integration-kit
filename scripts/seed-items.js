/**
 * Creates the kit's three test items in your Xsolla project:
 *
 *   kit-demo-pass      the item the test store sells (or your XSOLLA_TEST_SKU)
 *   kit-demo-disabled  the same item, disabled on purpose: npm run demo:empty-cart uses it
 *   kit-demo-hidden    enabled, but not shown in the store: the demo shows it can't be bought either
 *
 * Safe to run twice: if Xsolla rejects an item (for example, because it already exists), the script
 * prints Xsolla's answer and carries on.
 */
import { credentialsFromEnv, testSku } from "../src/config.js";
import { createVirtualItem, XsollaApiError } from "../src/xsolla.js";

const price = [{ amount: 1.99, currency: "USD", is_default: true, is_enabled: true }];

const items = [
  {
    sku: testSku(),
    name: { en: "Kit demo pass" },
    description: { en: "A test item for the Xsolla integration kit." },
    prices: price,
    is_enabled: true,
    is_show_in_store: true,
  },
  {
    sku: "kit-demo-disabled",
    name: { en: "Kit demo pass (disabled)" },
    description: { en: "Disabled on purpose, to reproduce an empty cart." },
    prices: price,
    is_enabled: false,
    is_show_in_store: false,
  },
  {
    sku: "kit-demo-hidden",
    name: { en: "Kit demo pass (hidden)" },
    description: { en: "Enabled, but hidden from the store's catalog." },
    prices: price,
    is_enabled: true,
    is_show_in_store: false,
  },
];

const credentials = credentialsFromEnv();
for (const item of items) {
  try {
    await createVirtualItem(credentials, item);
    console.log(`Created ${item.sku}`);
  } catch (error) {
    if (!(error instanceof XsollaApiError)) throw error;
    console.log(`${item.sku}: not created.`, error.summary());
  }
}
