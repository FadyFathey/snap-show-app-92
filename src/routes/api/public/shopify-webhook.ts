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
    .array(z.object({ variant_id: z.union([z.number(), z.string()]).nullable().optional(), quantity: z.number().int().nonnegative() }))
    .optional(),
});

const API = "2026-10";
let cachedToken: { value: string; expiresAt: number } | undefined;
let pendingToken: Promise<string> | undefined;

function storeHost() {
  const host = (process.env["SHOPIFY_STORE_DOMAIN"] ?? "").toLowerCase().trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(host)) throw new Error("Invalid Shopify store domain");
  return host;
}

async function accessToken(host: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  if (pendingToken) return pendingToken;
  pendingToken = (async () => {
    const clientId = process.env["SHOPIFY_CLIENT_ID"];
    const clientSecret = process.env["SHOPIFY_CLIENT_SECRET"];
    if (!clientId || !clientSecret) throw new Error("Shopify credentials are not configured");
    const response = await fetch(`https://${host}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) throw new Error(`Shopify token request failed: ${response.status}`);
    const result = await response.json();
    if (typeof result.access_token !== "string" || !Number.isFinite(result.expires_in)) throw new Error("Invalid token response");
    cachedToken = { value: result.access_token, expiresAt: Date.now() + Math.max(0, result.expires_in - 60) * 1000 };
    return cachedToken.value;
  })();
  try { return await pendingToken; } finally { pendingToken = undefined; }
}

async function computeCost(items: { variant_id?: number | string | null | undefined; quantity: number }[]) {
  if (items.length === 0 || items.length > 250 || items.some(item => !item.variant_id)) return { cost: 0, missing: true };
  try {
    const host = storeHost();
    const token = await accessToken(host);
    const ids = [...new Set(items.map(item => `gid://shopify/ProductVariant/${item.variant_id}`))];
    const response = await fetch(`https://${host}/admin/api/${API}/graphql.json`, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "query VariantCosts($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { id inventoryItem { unitCost { amount } } } } }",
        variables: { ids },
      }),
      signal: AbortSignal.timeout(1500),
    });
    if (response.status === 401) cachedToken = undefined;
    if (!response.ok) throw new Error(`Shopify cost request failed: ${response.status}`);
    const result = await response.json();
    if (result.errors || !Array.isArray(result.data?.nodes)) throw new Error("Shopify cost query failed");
    const costs = new Map<string, number>();
    for (const node of result.data.nodes) {
      const amount = node?.inventoryItem?.unitCost?.amount;
      if (amount == null || !Number.isFinite(Number(amount)) || Number(amount) < 0) return { cost: 0, missing: true };
      costs.set(node.id, Number(amount));
    }
    let total = 0;
    for (const item of items) {
      const cost = costs.get(`gid://shopify/ProductVariant/${item.variant_id}`);
      if (cost === undefined) return { cost: 0, missing: true };
      total += cost * item.quantity;
    }
    return { cost: Math.round(total * 100) / 100, missing: false };
  } catch {
    console.error("Shopify cost lookup unavailable");
    return { cost: 0, missing: true };
  }
}

export const Route = createFileRoute("/api/public/shopify-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["SHOPIFY_WEBHOOK_SECRET"] ?? process.env["SHOPIFY_CLIENT_SECRET"];
        if (!secret) return new Response("Not configured", { status: 500 });
        const body = Buffer.from(await request.arrayBuffer());
        const sig = request.headers.get("x-shopify-hmac-sha256") ?? "";
        const expected = createHmac("sha256", secret).update(body).digest("base64");
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Invalid signature", { status: 401 });

        let host: string;
        try { host = storeHost(); } catch { return new Response("Not configured", { status: 500 }); }
        if (request.headers.get("x-shopify-shop-domain")?.toLowerCase() !== host) return new Response("Invalid store", { status: 401 });
        const topic = request.headers.get("x-shopify-topic") ?? "";
        let parsed;
        try {
          parsed = OrderPayload.parse(JSON.parse(body.toString("utf8")));
        } catch {
          return new Response("Bad payload", { status: 400 });
        }
        const shopifyId = String(parsed.id);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (topic === "orders/create") {
          const { data: existing, error: lookupError } = await supabaseAdmin.from("orders").select("id").eq("shopify_order_id", shopifyId).maybeSingle();
          if (lookupError) return new Response("db error", { status: 500 });
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
          const { error } = await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("shopify_order_id", shopifyId);
          if (error) return new Response("db error", { status: 500 });
          return new Response("ok");
        }
        return new Response("ignored");
      },
    },
  },
});
