import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MonthPicker } from "@/components/MonthPicker";
import { CATEGORIES, type Expense, fmt, today, useExpenses, useMonth } from "@/lib/pl";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "المصاريف — حسابات المتجر" },
      { name: "description", content: "سجّل مصاريف الإعلانات والشحن والإيجار وغيرها." },
      { property: "og:title", content: "المصاريف — حسابات المتجر" },
      { property: "og:description", content: "سجّل مصاريف الإعلانات والشحن والإيجار وغيرها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpensesPage,
});

const schema = z.object({
  expense_date: z.string().min(1, "اختار التاريخ"),
  category: z.enum(CATEGORIES as [string, ...string[]], { errorMap: () => ({ message: "اختار البند" }) }),
  amount: z.coerce.number({ invalid_type_error: "المبلغ لازم يكون رقم" }).min(0, "المبلغ لازم يكون صفر أو أكتر"),
  notes: z.string().trim().max(500, "الملاحظات طويلة").optional(),
});

const empty = () => ({ expense_date: today(), category: CATEGORIES[0], amount: "", notes: "" });

function ExpensesPage() {
  const { ym } = useMonth();
  const { data = [], isLoading } = useExpenses(ym);
  const qc = useQueryClient();
  const [form, setForm] = useState(empty());
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = data.reduce((s, e) => s + e.amount, 0);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["year"] });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.amount === "") { toast.error("اكتب المبلغ"); return; }
    const p = schema.safeParse(form);
    if (!p.success) { toast.error(p.error.issues[0]?.message ?? "بيانات غير صحيحة"); return; }
    const row = { ...p.data, notes: p.data.notes || null };
    setBusy(true);
    const { error } = editId
      ? await supabase.from("expenses").update(row).eq("id", editId)
      : await supabase.from("expenses").insert(row);
    setBusy(false);
    if (error) { toast.error("ماقدرناش نحفظ المصروف، حاول تاني"); return; }
    toast.success(editId ? "تم تعديل المصروف" : "تم حفظ المصروف");
    setForm(empty());
    setEditId(null);
    refresh();
  }

  function edit(x: Expense) {
    setEditId(x.id);
    setForm({ expense_date: x.expense_date, category: x.category, amount: String(x.amount), notes: x.notes ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(x: Expense) {
    if (!confirm("حذف المصروف ده؟")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", x.id);
    if (error) { toast.error("ماقدرناش نحذف المصروف"); return; }
    toast.success("تم حذف المصروف");
    refresh();
  }

  return (
    <div className="space-y-4 px-5">
      <form onSubmit={save} className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 className="font-bold">{editId ? "تعديل مصروف" : "إضافة مصروف"}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label className="text-xs">التاريخ</Label>
            <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} className="h-11" /></div>
          <div className="space-y-1"><Label className="text-xs">البند</Label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div className="col-span-2 space-y-1"><Label className="text-xs">المبلغ</Label>
            <Input type="number" inputMode="decimal" min={0} step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="h-11" /></div>
          <div className="col-span-2 space-y-1"><Label className="text-xs">ملاحظات (اختياري)</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="h-11" /></div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy} className="h-12 flex-1 text-lg">حفظ</Button>
          {editId && <Button type="button" variant="outline" className="h-12" onClick={() => { setEditId(null); setForm(empty()); }}>إلغاء</Button>}
        </div>
      </form>

      <MonthPicker />

      <div className="flex items-center justify-between rounded-2xl bg-loss-soft p-4">
        <span className="text-sm">إجمالي مصاريف الشهر</span>
        <span className="text-xl font-extrabold text-loss num">{fmt(total)}</span>
      </div>

      <div className="space-y-2">
        {isLoading && <p className="text-center text-sm text-muted-foreground">جاري التحميل…</p>}
        {!isLoading && data.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">مفيش مصاريف في الشهر ده</p>}
        {data.map((x) => (
          <div key={x.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold">{x.category}</span>
                <span className="text-xs text-muted-foreground num">{x.expense_date}</span>
              </div>
              {x.notes && <div className="mt-1 truncate text-xs text-muted-foreground">{x.notes}</div>}
            </div>
            <div className="text-sm font-bold num">{fmt(x.amount)}</div>
            <button onClick={() => edit(x)} className="rounded-lg p-2 hover:bg-muted" aria-label="تعديل"><Pencil className="h-4 w-4" /></button>
            <button onClick={() => remove(x)} className="rounded-lg p-2 text-loss hover:bg-loss-soft" aria-label="حذف"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
