import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MonthPicker } from "@/components/MonthPicker";
import { type Return, fmt, fmtNum, useMonth, useReturns } from "@/lib/pl";

export const Route = createFileRoute("/_authenticated/returns")({
  head: () => ({
    meta: [
      { title: "المرتجعات — حسابات المتجر" },
      { name: "description", content: "سجل المرتجعات وخسائر الشحن والمنتجات لكل شهر." },
      { property: "og:title", content: "المرتجعات — حسابات المتجر" },
      { property: "og:description", content: "سجل المرتجعات وخسائر الشحن والمنتجات لكل شهر." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReturnsPage,
});

function ReturnsPage() {
  const { ym } = useMonth();
  const { data = [], isLoading } = useReturns(ym);
  const qc = useQueryClient();
  const ship = data.reduce((s, r) => s + r.shipping_loss, 0);
  const prod = data.reduce((s, r) => s + r.product_loss, 0);

  async function undo(r: Return) {
    if (!confirm(`إلغاء المرتجع للطلب ${r.order_number}؟ الطلب هيرجع "طلع".`)) return;
    const { error } = await supabase.rpc("undo_return", { _order_id: r.order_id });
    if (error) { toast.error("ماقدرناش نلغي المرتجع"); return; }
    toast.success("تم إلغاء المرتجع");
    ["orders", "returns", "year"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  }

  return (
    <div className="space-y-4 px-5">
      <MonthPicker />
      <div className="grid grid-cols-2 gap-3">
        <Box label="عدد المرتجعات" value={fmtNum(data.length)} />
        <Box label="إجمالي الخسارة" value={fmt(ship + prod)} strong />
        <Box label="خسارة الشحن" value={fmt(ship)} />
        <Box label="خسارة المنتجات" value={fmt(prod)} />
      </div>
      <div className="space-y-2">
        {isLoading && <p className="text-center text-sm text-muted-foreground">جاري التحميل…</p>}
        {!isLoading && data.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">مفيش مرتجعات في الشهر ده</p>}
        {data.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold num">{r.order_number}</span>
                <span className="text-xs text-muted-foreground num">{r.return_date}</span>
                {r.restocked && <span className="rounded-full bg-profit-soft px-2 py-0.5 text-xs text-profit">رجع المخزن</span>}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{r.reason}{r.notes ? ` · ${r.notes}` : ""}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                شحن <span className="num">{fmt(r.shipping_loss)}</span> · منتج <span className="num">{fmt(r.product_loss)}</span>
              </div>
            </div>
            <div className="text-sm font-bold text-loss num">{fmt(r.shipping_loss + r.product_loss)}</div>
            <button onClick={() => undo(r)} className="rounded-lg p-2 hover:bg-muted" aria-label="إلغاء المرتجع"><Undo2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Box({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 ${strong ? "bg-loss-soft" : "bg-card"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-base font-bold num ${strong ? "text-loss" : ""}`}>{value}</div>
    </div>
  );
}
