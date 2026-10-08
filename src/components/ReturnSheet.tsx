import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RETURN_REASONS, type Order, today, fmt } from "@/lib/pl";

export function ReturnSheet({ order, collected = false, onClose, onDone }: { order: Order | null; collected?: boolean; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState(RETURN_REASONS[0]!);
  const [notes, setNotes] = useState("");
  const [ship, setShip] = useState("0");
  const [prod, setProd] = useState("0");
  const [restocked, setRestocked] = useState(true);
  const [shippingCollected, setShippingCollected] = useState(collected);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (order) { setDate(today()); setReason(RETURN_REASONS[0]!); setNotes(""); setShip("0"); setProd("0"); setRestocked(true); setShippingCollected(collected); }
  }, [order, collected]);

  async function confirm() {
    if (!order || busy) return;
    const s = Number(ship), p = restocked ? 0 : Number(prod);
    if (!date || ship.trim() === "" || !Number.isFinite(s) || !Number.isFinite(p) || !(s >= 0) || !(p >= 0)) { toast.error("الخسائر لازم تكون أرقام صفر أو أكتر"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("mark_returned_collection", {
      _order_id: order.id, _return_date: date, _reason: reason, _notes: notes.trim().slice(0, 500),
      _shipping_collected: shippingCollected ? 100 : 0, _shipping_loss: s, _product_loss: p, _restocked: restocked,
    });
    setBusy(false);
    if (error) { toast.error(/already/.test(error.message) ? "الطلب ده مرتجع بالفعل" : "ماقدرناش نسجل المرتجع"); return; }
    toast.success("تم تسجيل المرتجع");
    onDone();
    onClose();
  }

  return (
    <Sheet open={!!order} onOpenChange={(o) => !o && !busy && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-2xl overflow-y-auto rounded-t-3xl" dir="rtl">
        <SheetHeader><SheetTitle className="text-right">مرتجع الطلب <span className="num">{order?.order_number}</span></SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button className="h-auto min-h-11 whitespace-normal" disabled={busy} variant={shippingCollected ? "outline" : "default"} aria-pressed={!shippingCollected} onClick={() => setShippingCollected(false)}>مرتجع — لم يتم التحصيل</Button>
            <Button className="h-auto min-h-11 whitespace-normal" disabled={busy} variant={shippingCollected ? "default" : "outline"} aria-pressed={shippingCollected} onClick={() => setShippingCollected(true)}>مرتجع — تم تحصيل الشحن (100 جنيه)</Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">تاريخ المرتجع</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" /></div>
            <div className="space-y-1"><Label className="text-xs">السبب</Label>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
                {RETURN_REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label className="text-xs">تكلفة شحن المرتجع (خصم بوسطة)</Label><Input type="number" inputMode="decimal" min={0} step="any" value={ship} onChange={(e) => setShip(e.target.value)} className="h-11" /></div>
            <div className="space-y-1"><Label className="text-xs">خسارة المنتج</Label><Input type="number" inputMode="decimal" min={0} step="any" disabled={restocked} value={restocked ? "0" : prod} onChange={(e) => setProd(e.target.value)} className="h-11" /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={restocked} onCheckedChange={(v) => setRestocked(!!v)} /> رجع المخزن سليم</label>
          <div className="space-y-1"><Label className="text-xs">ملاحظات</Label><Input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} className="h-11" /></div>
          <p className="rounded-xl bg-muted p-3 text-sm">تحصيل الشحن: {fmt(shippingCollected ? 100 : 0)} · صافي المرتجع: {fmt((shippingCollected ? 100 : 0) - (Number(ship) || 0) - (restocked ? 0 : Number(prod) || 0))}</p>
          <p className="text-xs text-muted-foreground">خصم الشحن يُسجّل هنا؛ لا تضفه مرة أخرى في المصاريف.</p>
          <Button onClick={confirm} disabled={busy} className="h-12 w-full bg-warn text-lg text-warn-foreground hover:bg-warn/90">تأكيد المرتجع</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
