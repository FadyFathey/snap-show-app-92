import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { YearPicker } from "@/components/MonthPicker";
import { fmtNum, stats, useMonth, useYear, yearly } from "@/lib/pl";

export const Route = createFileRoute("/_authenticated/summary")({
  head: () => ({
    meta: [
      { title: "الملخص الشهري — حسابات المتجر" },
      { name: "description", content: "جدول السنة كاملة شهر بشهر مع التصدير لملف Excel." },
      { property: "og:title", content: "الملخص الشهري — حسابات المتجر" },
      { property: "og:description", content: "جدول السنة كاملة شهر بشهر مع التصدير لملف Excel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SummaryPage,
});

const result = (n: number) => (n >= 0 ? "كسبان" : "خسران");

function SummaryPage() {
  const { ym } = useMonth();
  const year = Number(ym.slice(0, 4));
  const { data, isLoading } = useYear(year);
  const rows = yearly(data?.orders ?? [], data?.expenses ?? []);
  const total = stats(data?.orders ?? [], data?.expenses ?? []);

  async function exportXlsx() {
    if (!data) return;
    try {
      const XLSX = await import("xlsx");
      const head = ["الشهر", "عدد الطلبات", "المبيعات", "التكلفة", "مجمل الربح", "المصاريف", "صافي الربح", "النتيجة"];
      const line = (n: string, r: typeof total) => [n, r.count, r.sales, r.cost, r.gross, r.expenses, r.net, result(r.net)];
      const s1 = XLSX.utils.aoa_to_sheet([head, ...rows.map((r) => line(r.name, r)), line("الإجمالي", total)]);
      const s2 = XLSX.utils.aoa_to_sheet([
        ["التاريخ", "رقم الطلب", "إجمالي السعر", "التكلفة", "الربح"],
        ...data.orders.map((o) => [o.order_date, o.order_number, o.total_price, o.cost, o.total_price - o.cost]),
      ]);
      const s3 = XLSX.utils.aoa_to_sheet([
        ["التاريخ", "البند", "المبلغ", "ملاحظات"],
        ...data.expenses.map((e) => [e.expense_date, e.category, e.amount, e.notes ?? ""]),
      ]);
      const wb = XLSX.utils.book_new();
      wb.Workbook = { Views: [{ RTL: true }] };
      XLSX.utils.book_append_sheet(wb, s1, "الملخص");
      XLSX.utils.book_append_sheet(wb, s2, "الطلبات");
      XLSX.utils.book_append_sheet(wb, s3, "المصاريف");
      XLSX.writeFile(wb, `حسابات-${year}.xlsx`);
      toast.success("تم تنزيل الملف");
    } catch {
      toast.error("ماقدرناش نعمل الملف، حاول تاني");
    }
  }

  const cols = ["الشهر", "الطلبات", "المبيعات", "التكلفة", "مجمل الربح", "المصاريف", "صافي الربح", "النتيجة"];

  return (
    <div className="space-y-4 px-5">
      <YearPicker />
      <Button onClick={exportXlsx} disabled={!data} className="h-12 w-full text-base">
        <Download className="h-5 w-5" /> تصدير Excel
      </Button>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>{cols.map((c) => <th key={c} className="px-3 py-3 text-right font-semibold">{c}</th>)}</tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">جاري التحميل…</td></tr>
            ) : (
              rows.map((r) => <Row key={r.name} name={r.name} r={r} />)
            )}
          </tbody>
          <tfoot className="border-t-2 bg-accent font-bold">
            <Row name="الإجمالي" r={total} />
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Row({ name, r }: { name: string; r: ReturnType<typeof stats> }) {
  const win = r.net >= 0;
  return (
    <tr className="border-t">
      <td className="px-3 py-2.5 font-semibold">{name}</td>
      <td className="px-3 num">{fmtNum(r.count)}</td>
      <td className="px-3 num">{fmtNum(r.sales)}</td>
      <td className="px-3 num">{fmtNum(r.cost)}</td>
      <td className="px-3 num">{fmtNum(r.gross)}</td>
      <td className="px-3 num">{fmtNum(r.expenses)}</td>
      <td className={`px-3 font-bold num ${win ? "text-profit" : "text-loss"}`}>{fmtNum(r.net)}</td>
      <td className="px-3">
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${win ? "bg-profit-soft text-profit" : "bg-loss-soft text-loss"}`}>{result(r.net)}</span>
      </td>
    </tr>
  );
}
