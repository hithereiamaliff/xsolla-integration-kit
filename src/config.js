/**
 * Settings, read from environment variables (the npm scripts load .env for you).
 * The API key and webhook secret stay on the server: never ship them to a browser or game client.
 */

/** Xsolla's API for catalog items and payment tokens. */
export const API_BASE = "https://store.xsolla.com/api";

/** The payment UI. Sandbox takes test cards only; live needs a signed licensing agreement. */
export const PAYMENT_UI = {
  sandbox: "https://sandbox-secure.xsolla.com/paystation4/",
  live: "https://secure.xsolla.com/paystation4/",
};

/** Reads a required setting, with a clear message if it's missing. */
export function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  return value;
}

/** The project ID and API key that admin calls authenticate with. */
export function credentialsFromEnv() {
  return { projectId: requireEnv("XSOLLA_PROJECT_ID"), apiKey: requireEnv("XSOLLA_API_KEY") };
}

/** The SKU the test store sells. */
export const testSku = () => process.env.XSOLLA_TEST_SKU?.trim() || "kit-demo-pass";
