import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RETURN_REASONS, type Order, today } from "@/lib/pl";

export function ReturnSheet({ order, onClose, onDone }: { order: Order | null; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState(RETURN_REASONS[0]!);
  const [notes, setNotes] = useState("");
  const [ship, setShip] = useState("0");
  const [prod, setProd] = useState("0");
  const [restocked, setRestocked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (order) { setDate(today()); setReason(RETURN_REASONS[0]!); setNotes(""); setShip("0"); setProd("0"); setRestocked(false); }
  }, [order]);

  async function confirm() {
    if (!order) return;
    const s = Number(ship), p = restocked ? 0 : Number(prod);
    if (!(s >= 0) || !(p >= 0)) { toast.error("الخسائر لازم تكون أرقام صفر أو أكتر"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("mark_returned", {
      _order_id: order.id, _return_date: date, _reason: reason, _notes: notes.trim().slice(0, 500),
      _shipping_loss: s, _product_loss: p, _restocked: restocked,
    });
    setBusy(false);
    if (error) { toast.error(/already/.test(error.message) ? "الطلب ده مرتجع بالفعل" : "ماقدرناش نسجل المرتجع"); return; }
    toast.success("تم تسجيل المرتجع");
    onDone();
    onClose();
  }

  return (
    <Sheet open={!!order} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-w-2xl rounded-t-3xl" dir="rtl">
        <SheetHeader><SheetTitle className="text-right">مرتجع الطلب <span className="num">{order?.order_number}</span></SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">تاريخ المرتجع</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" /></div>
            <div className="space-y-1"><Label className="text-xs">السبب</Label>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
                {RETURN_REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label className="text-xs">خسارة الشحن</Label><Input type="number" inputMode="decimal" min={0} step="any" value={ship} onChange={(e) => setShip(e.target.value)} className="h-11" /></div>
            <div className="space-y-1"><Label className="text-xs">خسارة المنتج</Label><Input type="number" inputMode="decimal" min={0} step="any" disabled={restocked} value={restocked ? "0" : prod} onChange={(e) => setProd(e.target.value)} className="h-11" /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={restocked} onCheckedChange={(v) => setRestocked(!!v)} /> رجع المخزن سليم</label>
          <div className="space-y-1"><Label className="text-xs">ملاحظات</Label><Input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} className="h-11" /></div>
          <Button onClick={confirm} disabled={busy} className="h-12 w-full bg-warn text-lg text-warn-foreground hover:bg-warn/90">تأكيد المرتجع</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
