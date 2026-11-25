/**
 * A tiny file-backed store, standing in for your game's database.
 *
 *   players    who may buy. user_validation answers from this list.
 *   orders     one record per Xsolla order.id. This is what makes order_paid safe to deliver twice.
 *   inventory  what each player owns.
 *
 * In production this is a table with a unique key on the order ID, written in one transaction.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const fresh = () => ({ players: ["player-1", "player-2"], orders: {}, inventory: {} });

export class Store {
  constructor(file) {
    this.file = file;
    try {
      this.data = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      this.data = fresh();
    }
  }

  hasPlayer(id) {
    return this.data.players.includes(String(id));
  }

  /**
   * Adds an order's items to a player, once per order ID.
   * Returns "granted", "duplicate" (already granted) or "canceled" (its cancellation arrived first).
   */
  grant(orderId, playerId, items, mode) {
    const existing = this.data.orders[orderId];
    if (existing) return existing.status === "canceled" ? "canceled" : "duplicate";

    const owned = (this.data.inventory[playerId] ??= {});
    const lines = items.map((item) => ({ sku: item.sku, quantity: Number(item.quantity ?? 1) }));
    for (const { sku, quantity } of lines) owned[sku] = (owned[sku] ?? 0) + quantity;
    this.data.orders[orderId] = { status: "granted", playerId, items: lines, mode, at: new Date().toISOString() };
    this.#save();
    return "granted";
  }

  /**
   * Takes back what an order granted, once. A cancellation that arrives before its payment leaves
   * a record, so the late order_paid can't grant afterwards.
   * Returns "revoked", "duplicate" (already canceled) or "recorded" (nothing had been granted yet).
   */
  revoke(orderId) {
    const order = this.data.orders[orderId];
    if (order?.status === "canceled") return "duplicate";
    if (!order) {
      this.data.orders[orderId] = { status: "canceled", at: new Date().toISOString() };
      this.#save();
      return "recorded";
    }
    const owned = this.data.inventory[order.playerId] ?? {};
    for (const { sku, quantity } of order.items) owned[sku] = Math.max(0, (owned[sku] ?? 0) - quantity);
    order.status = "canceled";
    order.canceledAt = new Date().toISOString();
    this.#save();
    return "revoked";
  }

  inventory(playerId) {
    return this.data.inventory[playerId] ?? {};
  }

  #save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(this.data, null, 2));
    renameSync(temp, this.file); // Replace in one step, so a crash never leaves half a file.
  }
}
