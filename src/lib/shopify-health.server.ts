import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function inspectShopifyConnection() {
  let databaseReady = false;
  let databaseError = "";
  try {
    const { error } = await supabaseAdmin.from("orders").select("id").limit(1);
    databaseReady = !error;
    if (error) databaseError = `تعذر اتصال استقبال الطلبات بقاعدة البيانات (${error.code ?? "unknown"}). راجع مفتاح السيرفر.`;
  } catch {
    databaseError = "إعدادات قاعدة البيانات الخاصة باستقبال الطلبات غير مكتملة.";
  }

  let shopifyReady = false;
  let shopifyError = "";
  let appWebhooks: { topic: string; uri: string }[] = [];
  const host = (process.env.SHOPIFY_STORE_DOMAIN ?? "").trim().toLowerCase();
  try {
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(host)) throw new Error("دومين المتجر غير صحيح.");
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("بيانات تطبيق شوبيفاي غير مكتملة.");
    const tokenResponse = await fetch(`https://${host}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenResponse.ok) throw new Error(`تعذر تجديد اتصال شوبيفاي (${tokenResponse.status}).`);
    const token = await tokenResponse.json();
    if (typeof token.access_token !== "string") throw new Error("رد اتصال شوبيفاي غير صحيح.");
    const response = await fetch(`https://${host}/admin/api/2026-10/graphql.json`, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": token.access_token, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "query ShopifyConnection { shop { myshopifyDomain } currentAppInstallation { accessScopes { handle } } orders(first: 1) { nodes { id } } webhookSubscriptions(first: 100) { nodes { topic uri } pageInfo { hasNextPage endCursor } } }" }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`تعذر قراءة شوبيفاي (${response.status}).`);
    const result = await response.json();
    if (result.errors || result.data?.shop?.myshopifyDomain !== host || !result.data?.orders) throw new Error("تطبيق شوبيفاي لا يستطيع قراءة الطلبات. راجع التثبيت والصلاحيات.");
    shopifyReady = true;
    appWebhooks = (result.data.webhookSubscriptions?.nodes ?? []).map((item: { topic: string; uri: string }) => ({ topic: item.topic, uri: item.uri }));
  } catch (error) {
    shopifyError = error instanceof Error && error.name !== "TimeoutError" ? error.message : "انتهت مهلة الاتصال بشوبيفاي، أعد الفحص.";
  }
  return { databaseReady, databaseError, shopifyReady, shopifyError, appWebhooks };
}
