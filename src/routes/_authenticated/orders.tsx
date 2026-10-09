import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MonthPicker } from "@/components/MonthPicker";
import { ReturnSheet } from "@/components/ReturnSheet";
import { type Order, type OrderStatus, STATUS_LABEL, fmt, today, useMonth, useOrders } from "@/lib/pl";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({
    meta: [
      { title: "الطلبات — حسابات المتجر" },
      { name: "description", content: "سجّل طلباتك بسرعة واعرف ربح كل طلب." },
      { property: "og:title", content: "الطلبات — حسابات المتجر" },
      { property: "og:description", content: "سجّل طلباتك بسرعة واعرف ربح كل طلب." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrdersPage,
});

const schema = z.object({
  order_date: z.string().min(1, "اختار التاريخ"),
  order_number: z.string().trim().min(1, "اكتب رقم الطلب").max(50, "رقم الطلب طويل"),
  total_price: z.coerce.number({ invalid_type_error: "السعر لازم يكون رقم" }).min(0, "السعر لازم يكون صفر أو أكتر"),
  cost: z.coerce.number({ invalid_type_error: "التكلفة لازم تكون رقم" }).min(0, "التكلفة لازم تكون صفر أو أكتر"),
});

const empty = () => ({ order_date: today(), order_number: "", total_price: "", cost: "" });

function OrdersPage() {
  const { ym } = useMonth();
  const { data = [], isLoading } = useOrders(ym);
  const qc = useQueryClient();
  const [form, setForm] = useState(empty());
  const [editId, setEditId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [returning, setReturning] = useState<Order | null>(null);
  const [returnCollected, setReturnCollected] = useState(false);
  const [costDraft, setCostDraft] = useState<Record<string, string>>({});

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["returns"] });
    qc.invalidateQueries({ queryKey: ["year"] });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.total_price === "" || form.cost === "") { toast.error("اكتب السعر والتكلفة"); return; }
    const p = schema.safeParse(form);
    if (!p.success) { toast.error(p.error.issues[0]?.message ?? "بيانات غير صحيحة"); return; }
    setBusy(true);
    const { error } = editId
      ? await supabase.from("orders").update(p.data).eq("id", editId)
      : await supabase.from("orders").insert(p.data);
    setBusy(false);
    if (error) { toast.error("ماقدرناش نحفظ الطلب، حاول تاني"); return; }
    toast.success(editId ? "تم تعديل الطلب" : "تم حفظ الطلب");
    setForm(empty());
    setEditId(null);
    refresh();
  }

  function edit(o: Order) {
    setEditId(o.id);
    setForm({ order_date: o.order_date, order_number: o.order_number, total_price: String(o.total_price), cost: String(o.cost) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(o: Order) {
    if (!confirm(`حذف الطلب ${o.order_number}؟`)) return;
    const { error } = await supabase.from("orders").delete().eq("id", o.id);
    if (error) { toast.error("ماقدرناش نحذف الطلب"); return; }
    toast.success("تم حذف الطلب");
    refresh();
  }

  async function setStatus(o: Order, status: OrderStatus) {
    if (status === "cancelled" && !confirm(`إلغاء الطلب ${o.order_number}؟`)) return;
    const { error } = await supabase.from("orders").update({ status }).eq("id", o.id);
    if (error) { toast.error("ماقدرناش نغيّر الحالة"); return; }
    toast.success(`الطلب ${o.order_number}: ${STATUS_LABEL[status]}`);
    refresh();
  }

  async function saveCost(o: Order) {
    const v = Number(costDraft[o.id]);
    if (costDraft[o.id] === undefined || costDraft[o.id] === "" || !(v >= 0)) { toast.error("اكتب تكلفة صحيحة"); return; }
    const { error } = await supabase.from("orders").update({ cost: v, cost_missing: false }).eq("id", o.id);
    if (error) { toast.error("ماقدرناش نحفظ التكلفة"); return; }
    toast.success("تم حفظ التكلفة");
    refresh();
  }

  const waiting = data.filter((o) => o.status === "new").length;
  const list = data.filter(
    (o) => (filter === "all" || o.status === filter) && o.order_number.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4 px-5">
      <div className="flex items-center justify-between rounded-2xl bg-warn-soft px-4 py-3">
        <span className="font-semibold">أوردرات مستنية</span>
        <span className="text-2xl font-extrabold text-warn num">{waiting}</span>
      </div>

      <form onSubmit={save} className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 className="font-bold">{editId ? "تعديل طلب" : "إضافة طلب"}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="التاريخ"><Input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} className="h-11" /></Field>
          <Field label="رقم الطلب"><Input dir="ltr" value={form.order_number} onChange={(e) => setForm({ ...form, order_number: e.target.value })} className="h-11" placeholder="#1001" /></Field>
          <Field label="إجمالي السعر"><Input type="number" inputMode="decimal" min={0} step="any" value={form.total_price} onChange={(e) => setForm({ ...form, total_price: e.target.value })} className="h-11" /></Field>
          <Field label="التكلفة"><Input type="number" inputMode="decimal" min={0} step="any" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className="h-11" /></Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy} className="h-12 flex-1 text-lg">حفظ</Button>
          {editId && <Button type="button" variant="outline" className="h-12" onClick={() => { setEditId(null); setForm(empty()); }}>إلغاء</Button>}
        </div>
      </form>

      <MonthPicker />

      <div className="relative">
        <Search className="absolute right-3 top-3 h-5 w-5 text-muted-foreground" />
        <Input placeholder="ابحث برقم الطلب" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 pr-10" />
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {(["all", "new", "shipped", "returned", "cancelled"] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${filter === s ? "bg-primary text-primary-foreground" : "bg-card"}`}>
            {s === "all" ? "الكل" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {isLoading && <p className="text-center text-sm text-muted-foreground">جاري التحميل…</p>}
        {!isLoading && list.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">مفيش طلبات</p>}
        {list.map((o) => {
          const profit = o.status === "returned" ? o.return_balance ?? 0 : o.status === "cancelled" ? 0 : o.total_price - o.cost;
          return (
            <div key={o.id} className="space-y-3 rounded-2xl border bg-card p-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold num">{o.order_number}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${BADGE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                    {o.source === "shopify" && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">شوبيفاي</span>}
                    <span className="text-xs text-muted-foreground num">{o.order_date}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    السعر <span className="num">{fmt(o.total_price)}</span> · التكلفة <span className="num">{fmt(o.cost)}</span>
                  </div>
                </div>
                <div className={`text-sm font-bold num ${profit >= 0 ? "text-profit" : "text-loss"}`}>{fmt(profit)}</div>
                <button onClick={() => edit(o)} className="rounded-lg p-2 hover:bg-muted" aria-label="تعديل"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => remove(o)} className="rounded-lg p-2 text-loss hover:bg-loss-soft" aria-label="حذف"><Trash2 className="h-4 w-4" /></button>
              </div>
              {o.status === "returned" && <p className="text-sm text-muted-foreground">{o.shipping_collected === 100 ? "مرتجع — تم تحصيل الشحن (100 جنيه)" : "مرتجع — لم يتم التحصيل"} · صافي المرتجع {fmt(profit)}</p>}
              {o.cost_missing && o.status !== "returned" && o.status !== "cancelled" && (
                <div className="flex items-center gap-2 rounded-xl bg-warn-soft p-2">
                  <span className="shrink-0 rounded-full bg-warn px-2 py-0.5 text-xs font-bold text-warn-foreground">التكلفة ناقصة</span>
                  <Input type="number" inputMode="decimal" min={0} step="any" placeholder="التكلفة" className="h-9"
                    value={costDraft[o.id] ?? ""} onChange={(e) => setCostDraft({ ...costDraft, [o.id]: e.target.value })} />
                  <Button size="sm" onClick={() => saveCost(o)}>حفظ</Button>
                </div>
              )}
              {o.status === "new" && (
                <div className="grid grid-cols-2 gap-2">
                  <Button className="h-11 bg-profit text-profit-foreground hover:bg-profit/90" onClick={() => setStatus(o, "shipped")}>طلع</Button>
                  <Button className="h-auto min-h-11 whitespace-normal bg-warn text-warn-foreground hover:bg-warn/90" onClick={() => { setReturnCollected(false); setReturning(o); }}>مرتجع — لم يتم التحصيل</Button>
                  <Button className="h-11 bg-loss text-loss-foreground hover:bg-loss/90" onClick={() => setStatus(o, "cancelled")}>ملغي</Button>
                </div>
              )}
              {(o.status === "new" || o.status === "shipped") && (
                <Button className="h-auto min-h-11 w-full whitespace-normal bg-warn text-warn-foreground hover:bg-warn/90" onClick={() => { setReturnCollected(true); setReturning(o); }}>مرتجع — تم تحصيل الشحن (100 جنيه)</Button>
              )}
              {o.status === "shipped" && (
                <Button className="h-auto min-h-11 w-full whitespace-normal bg-warn text-warn-foreground hover:bg-warn/90" onClick={() => { setReturnCollected(false); setReturning(o); }}>مرتجع — لم يتم التحصيل</Button>
              )}
            </div>
          );
        })}
      </div>
      <ReturnSheet order={returning} collected={returnCollected} onClose={() => setReturning(null)} onDone={refresh} />
    </div>
  );
}

const BADGE: Record<OrderStatus, string> = {
  new: "bg-warn-soft text-warn",
  shipped: "bg-profit-soft text-profit",
  returned: "bg-loss-soft text-loss",
  cancelled: "bg-muted text-muted-foreground",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}
