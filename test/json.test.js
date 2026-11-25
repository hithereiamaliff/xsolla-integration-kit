import assert from "node:assert/strict";
import { test } from "node:test";
import { parseJson, stringifyJson } from "../src/json.js";

test("keeps a 64-bit ID exact", () => {
  assert.equal(JSON.parse('{"id":9007199254740993}').id, 9007199254740992); // what goes wrong
  assert.equal(parseJson('{"id":9007199254740993}').id, 9007199254740993n);
});

test("leaves ordinary numbers as numbers", () => {
  assert.deepEqual(parseJson('{"amount":9.99,"quantity":2,"id":123456789,"big_float":1e21}'), {
    amount: 9.99,
    quantity: 2,
    id: 123456789,
    big_float: 1e21,
  });
});

test("writes a 64-bit ID back out unchanged", () => {
  const text = '{"order":{"id":9007199254740993,"amount":"1.99"}}';
  assert.equal(stringifyJson(parseJson(text)), text);
});
