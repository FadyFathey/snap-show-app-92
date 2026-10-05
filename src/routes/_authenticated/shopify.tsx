import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/shopify")({
  head: () => ({
    meta: [
      { title: "ربط شوبيفاي — حسابات المتجر" },
      { name: "description", content: "اربط متجر شوبيفاي علشان الطلبات تتسجل تلقائي." },
      { property: "og:title", content: "ربط شوبيفاي — حسابات المتجر" },
      { property: "og:description", content: "اربط متجر شوبيفاي علشان الطلبات تتسجل تلقائي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShopifyPage,
});

function ShopifyPage() {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const host = window.location.host;
    const m = host.match(/([0-9a-f-]{36})/);
    const base = m ? `https://project--${m[1]}.lovable.app` : window.location.origin;
    setUrl(`${base}/api/public/shopify-webhook`);
  }, []);
  const last = useQuery({
    queryKey: ["shopify-last"],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("order_number, created_at").eq("source", "shopify").order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  const steps = [
    "من لوحة تحكم شوبيفاي ادخل الإعدادات ← التطبيقات والقنوات ← تطوير التطبيقات، واعمل تطبيق مخصص جديد.",
    "في صلاحيات Admin API اختار read_orders و read_inventory، وبعدين ثبّت التطبيق.",
    "انسخ Admin API access token (بيبدأ بـ shpat_).",
    "ابعتلي في الشات إنك عايز تضيف مفاتيح شوبيفاي، وهيظهرلك نموذج آمن تحط فيه: SHOPIFY_ADMIN_TOKEN (التوكن)، SHOPIFY_STORE_DOMAIN (زي mystore.myshopify.com)، و SHOPIFY_WEBHOOK_SECRET.",
    "في شوبيفاي: الإعدادات ← الإشعارات ← Webhooks، أضف webhook لحدث Order creation وواحد لـ Order cancellation، بصيغة JSON، والرابط هو الرابط اللي فوق.",
    "انسخ مفتاح التوقيع اللي شوبيفاي بيعرضه تحت الـ webhooks وحطه في SHOPIFY_WEBHOOK_SECRET.",
    "اعمل طلب تجريبي، وهيظهر في صفحة الطلبات بحالة «جديد».",
  ];

  return (
    <div className="space-y-4 px-5">
      <h1 className="text-xl font-bold">ربط شوبيفاي</h1>
      <div className="space-y-2 rounded-2xl border bg-card p-4">
        <div className="text-sm font-semibold">رابط الـ Webhook</div>
        <div dir="ltr" className="break-all rounded-xl bg-muted p-3 text-xs">{url}</div>
        <Button className="h-11 w-full" onClick={() => { navigator.clipboard.writeText(url); toast.success("تم النسخ"); }}>
          <Copy className="h-4 w-4" /> نسخ الرابط
        </Button>
        <p className="text-xs text-muted-foreground">الرابط ده بيشتغل بعد نشر التطبيق.</p>
      </div>
      <div className="rounded-2xl border bg-card p-4">
        <div className="text-sm font-semibold">آخر طلب وصل من شوبيفاي</div>
        <div className="mt-1 text-sm num">
          {last.data ? `${last.data.order_number} — ${new Date(last.data.created_at).toLocaleString("ar-EG")}` : "لسه مفيش طلبات وصلت"}
        </div>
      </div>
      <div className="rounded-2xl border bg-card p-4">
        <div className="mb-2 text-sm font-semibold">خطوات الربط</div>
        <ol className="list-decimal space-y-2 pr-5 text-sm">{steps.map((s) => <li key={s}>{s}</li>)}</ol>
      </div>
    </div>
  );
}
