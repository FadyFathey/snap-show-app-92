import { createHmac, timingSafeEqual } from "node:crypto";

export function validShopifySignature(body: Buffer, signature: string, secrets: (string | undefined)[]) {
  const actual = Buffer.from(signature);
  return secrets.filter((secret): secret is string => Boolean(secret)).some((secret) => {
    const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("base64"));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

export function signedIngestPayload(action: "check" | "create" | "cancel", order?: Record<string, unknown>) {
  const secret = process.env.SHOPIFY_INGEST_SECRET;
  if (!secret) throw new Error("Shopify ingestion is not configured");
  const payload = JSON.stringify({ action, issued_at: Math.floor(Date.now() / 1000), order });
  return { _payload: payload, _signature: createHmac("sha256", secret).update(payload).digest("hex") };
}

export async function ingestShopifyOrder(action: "check" | "create" | "cancel", order?: Record<string, unknown>) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Shopify ingestion is not configured");
  const response = await fetch(`${url}/rest/v1/rpc/ingest_shopify_order`, {
    method: "POST",
    // Opaque publishable keys are API keys, not bearer tokens.
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(signedIngestPayload(action, order)),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Shopify ingestion rejected (${response.status})`);
  return response.json() as Promise<string>;
}
