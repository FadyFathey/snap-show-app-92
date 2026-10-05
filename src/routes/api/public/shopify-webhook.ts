import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const OrderPayload = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string().max(100).optional(),
  order_number: z.union([z.number(), z.string()]).optional(),
  created_at: z.string().optional(),
  total_price: z.union([z.string(), z.number()]).optional(),
  line_items: z
    .array(z.object({ variant_id: z.union([z.number(), z.string()]).nullable().optional(), quantity: z.number() }))
    .optional(),
});

const API = "2024-10";

async function computeCost(items: { variant_id?: number | string | null; quantity: number }[]) {
  const domain = process.env["SHOPIFY_STORE_DOMAIN"];
  const token = process.env["SHOPIFY_ADMIN_TOKEN"];
  if (!domain || !token || items.length === 0) return { cost: 0, missing: true };
  const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const headers = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };
  try {
    let total = 0;
    for (const it of items) {
      if (!it.variant_id) return { cost: 0, missing: true };
      const v = await fetch(`https://${host}/admin/api/${API}/variants/${it.variant_id}.json`, { headers });
      if (!v.ok) return { cost: 0, missing: true };
      const invId = (await v.json())?.variant?.inventory_item_id;
      if (!invId) return { cost: 0, missing: true };
      const inv = await fetch(`https://${host}/admin/api/${API}/inventory_items/${invId}.json`, { headers });
      if (!inv.ok) return { cost: 0, missing: true };
      const c = (await inv.json())?.inventory_item?.cost;
      if (c === null || c === undefined || c === "") return { cost: 0, missing: true };
      total += Number(c) * it.quantity;
    }
    return { cost: Math.round(total * 100) / 100, missing: false };
  } catch (e) {
    console.error("shopify cost lookup failed", e);
    return { cost: 0, missing: true };
  }
}

export const Route = createFileRoute("/api/public/shopify-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["SHOPIFY_WEBHOOK_SECRET"];
        if (!secret) return new Response("Not configured", { status: 500 });
        const body = await request.text();
        const sig = request.headers.get("x-shopify-hmac-sha256") ?? "";
        const expected = createHmac("sha256", secret).update(body, "utf8").digest("base64");
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Invalid signature", { status: 401 });

        const topic = request.headers.get("x-shopify-topic") ?? "";
        let parsed;
        try {
          parsed = OrderPayload.parse(JSON.parse(body));
        } catch {
          return new Response("Bad payload", { status: 400 });
        }
        const shopifyId = String(parsed.id);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (topic === "orders/create") {
          const { data: existing } = await supabaseAdmin.from("orders").select("id").eq("shopify_order_id", shopifyId).maybeSingle();
          if (existing) return new Response("duplicate ignored");
          const { cost, missing } = await computeCost(parsed.line_items ?? []);
          const date = (parsed.created_at ?? new Date().toISOString()).slice(0, 10);
          const { error } = await supabaseAdmin.from("orders").insert({
            order_date: date,
            order_number: parsed.name ?? `#${parsed.order_number ?? shopifyId}`,
            total_price: Number(parsed.total_price ?? 0),
            cost,
            cost_missing: missing,
            status: "new",
            shopify_order_id: shopifyId,
            source: "shopify",
            user_id: null,
          });
          if (error && error.code !== "23505") {
            console.error(error);
            return new Response("db error", { status: 500 });
          }
          return new Response("ok");
        }
        if (topic === "orders/cancelled") {
          await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("shopify_order_id", shopifyId);
          return new Response("ok");
        }
        return new Response("ignored");
      },
    },
  },
});
