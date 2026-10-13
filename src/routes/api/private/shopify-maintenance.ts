import { createFileRoute } from "@tanstack/react-router";

// Temporary commissioning endpoint. Removed once delivery is verified.
export const Route = createFileRoute("/api/private/shopify-maintenance")({
  server: { handlers: { POST: async ({ request }) => {
    const body = Buffer.from(await request.arrayBuffer());
    const { validShopifySignature } = await import("@/lib/shopify-ingest.server");
    if (body.length > 16384 || !validShopifySignature(body, request.headers.get("x-accounting-signature") ?? "", [process.env.SHOPIFY_INGEST_SECRET])) return new Response("Unauthorized", { status: 401 });
    let payload;
    try { payload = JSON.parse(body.toString("utf8")); } catch { return new Response("Bad payload", { status: 400 }); }
    if (!Number.isFinite(payload.issued_at) || Math.abs(Date.now()/1000-payload.issued_at)>300) return new Response("Expired", { status: 401 });
    if (!["ensure-webhooks", "test-delivery"].includes(payload.action)) return new Response("Bad action", { status: 400 });
    const host = (process.env.SHOPIFY_STORE_DOMAIN ?? "").trim().toLowerCase();
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(host) || !clientId || !clientSecret) return new Response("Not configured", { status: 500 });
    const tokenResponse = await fetch(`https://${host}/admin/oauth/access_token`, { method: "POST", headers: {"Content-Type":"application/x-www-form-urlencoded"}, body: new URLSearchParams({grant_type:"client_credentials",client_id:clientId,client_secret:clientSecret}), signal: AbortSignal.timeout(10000) });
    if (!tokenResponse.ok) return new Response("Token unavailable", {status:502});
    const { access_token: token } = await tokenResponse.json();
    if (typeof token !== "string") return new Response("Token unavailable", {status:502});
    async function graphql(query: string, variables: Record<string, unknown> = {}) {
      const response = await fetch(`https://${host}/admin/api/2026-10/graphql.json`, {method:"POST",headers:{"Content-Type":"application/json","X-Shopify-Access-Token":token},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(10000)});
      const result = await response.json();
      if (!response.ok || result.errors) throw new Error("Shopify request rejected");
      return result.data;
    }
    const callback = "https://snap-show-app-92.vercel.app/api/public/shopify-webhook";
    if (payload.action === "test-delivery") {
      const data = await graphql("query ReplayOrder($id: ID!) { order(id: $id) { id name createdAt totalPriceSet { shopMoney { amount } } } }", {id:"gid://shopify/Order/6153499050124"});
      if (!data.order) return new Response("Test order unavailable", {status:502});
      const raw = JSON.stringify({id:data.order.id.split("/").at(-1),name:data.order.name,created_at:data.order.createdAt,total_price:data.order.totalPriceSet.shopMoney.amount,line_items:[]});
      const { createHmac } = await import("node:crypto");
      const response = await fetch(callback,{method:"POST",headers:{"Content-Type":"application/json","x-shopify-topic":"orders/create","x-shopify-shop-domain":host,"x-shopify-hmac-sha256":createHmac("sha256",clientSecret).update(raw).digest("base64")},body:raw,signal:AbortSignal.timeout(15000)});
      return Response.json({status:response.status,result:await response.text()});
    }
    let data = await graphql("query { webhookSubscriptions(first: 100) { nodes { id topic uri } pageInfo { hasNextPage endCursor } } }");
    if (data.webhookSubscriptions.pageInfo.hasNextPage) return new Response("Subscription pagination required", {status:409});
    for (const topic of ["ORDERS_CREATE","ORDERS_CANCELLED"]) {
      if (data.webhookSubscriptions.nodes.some((item: {topic:string;uri:string}) => item.topic===topic && item.uri===callback)) continue;
      const created = await graphql("mutation Subscribe($topic: WebhookSubscriptionTopic!, $uri: String!) { webhookSubscriptionCreate(topic: $topic, webhookSubscription: {uri: $uri, format: JSON}) { webhookSubscription { id topic uri } userErrors { field message } } }",{topic,uri:callback});
      if (created.webhookSubscriptionCreate.userErrors.length) return Response.json({error:created.webhookSubscriptionCreate.userErrors},{status:502});
    }
    data = await graphql("query { webhookSubscriptions(first: 100) { nodes { id topic uri } pageInfo { hasNextPage endCursor } } }");
    return Response.json({subscriptions:data.webhookSubscriptions.nodes.filter((item:{uri:string})=>item.uri===callback)});
  } } },
});
