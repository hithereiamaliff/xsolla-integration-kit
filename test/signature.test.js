import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { signBody, verifySignature } from "../src/signature.js";

const secret = "test-secret";
const body = Buffer.from('{"notification_type":"user_validation","user":{"id":"player-1"}}');

test("matches a signature made the way Xsolla documents it", () => {
  // Xsolla: SHA-1 of the raw body followed by the secret key, lowercase hex, after "Signature ".
  const documented = createHash("sha1").update(body.toString("utf8") + secret).digest("hex");
  assert.ok(verifySignature(body, `Signature ${documented}`, secret));
  assert.equal(signBody(body, secret), `Signature ${documented}`);
});

test("rejects a body that changed after signing", () => {
  const changed = Buffer.from(body.toString().replace("player-1", "player-2"));
  assert.equal(verifySignature(changed, signBody(body, secret), secret), false);
});

test("rejects the same JSON re-serialised with different spacing", () => {
  const reformatted = Buffer.from(JSON.stringify(JSON.parse(body.toString()), null, 2));
  assert.equal(verifySignature(reformatted, signBody(body, secret), secret), false);
});

test("rejects a wrong secret, a missing header and a malformed one", () => {
  assert.equal(verifySignature(body, signBody(body, "other-secret"), secret), false);
  assert.equal(verifySignature(body, undefined, secret), false);
  assert.equal(verifySignature(body, "Signature abc", secret), false);
});
