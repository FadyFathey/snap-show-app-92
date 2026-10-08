// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { stats, yearly, type Order, type Return } from "@/lib/pl";
const order = { status: "returned", total_price: 700, cost: 200, order_date: "2026-10-01" } as Order;
const returned = { shipping_loss: 102, product_loss: 0, shipping_collected: 0, return_date: "2026-10-08" } as Return;
describe("returned order accounting", () => {
  it("excludes the sale and restocked product cost, charging only carrier fees", () => {
    const result = stats([order], [], [returned]);
    expect(result.sales).toBe(0);
    expect(result.cost).toBe(0);
    expect(result.net).toBe(-102);
  });
  it("offsets carrier fees by collected shipping", () => {
    expect(stats([order], [], [{ ...returned, shipping_collected: 100 }]).net).toBe(-2);
  });
  it("allows a positive return balance when the fee is below collection", () => {
    expect(stats([order], [], [{ ...returned, shipping_loss: 80, shipping_collected: 100 }]).net).toBe(20);
  });
  it("preserves accounting for legacy returns with no collection field", () => {
    const { shipping_collected, ...legacy } = returned;
    expect(stats([order], [], [legacy as Return]).net).toBe(-102);
  });
  it("accounts for damaged goods and expenses once", () => {
    expect(stats([order], [{ amount: 10 } as never], [{ ...returned, product_loss: 200, shipping_collected: 100 }]).net).toBe(-212);
  });
  it("recognizes the return balance in its return month", () => {
    const rows = yearly([{ ...order, order_date: "2026-09-30" }], [], [{ ...returned, shipping_collected: 100 }]);
    expect(rows[8]?.net).toBe(0);
    expect(rows[9]?.net).toBe(-2);
  });
});
