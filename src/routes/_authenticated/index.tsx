import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MonthPicker } from "@/components/MonthPicker";
import { fmt, fmtNum, stats, useExpenses, useMonth, useOrders, useYear, yearly } from "@/lib/pl";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "لوحة المتابعة — حسابات المتجر" },
      { name: "description", content: "مبيعات وتكاليف ومصاريف وصافي ربح الشهر في نظرة واحدة." },
      { property: "og:title", content: "لوحة المتابعة — حسابات المتجر" },
      { property: "og:description", content: "مبيعات وتكاليف ومصاريف وصافي ربح الشهر في نظرة واحدة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { ym } = useMonth();
  const orders = useOrders(ym);
  const expenses = useExpenses(ym);
  const year = useYear(Number(ym.slice(0, 4)));
  const s = stats(orders.data ?? [], expenses.data ?? []);
  const win = s.net >= 0;
  const chart = yearly(year.data?.orders ?? [], year.data?.expenses ?? []);

  return (
    <div className="space-y-4 px-5">
      <MonthPicker />

      <div className={`rounded-3xl p-6 ${win ? "bg-profit text-profit-foreground" : "bg-loss text-loss-foreground"}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm opacity-90">صافي الربح</span>
          <span className="rounded-full bg-card/20 px-3 py-1 text-sm font-bold">{win ? "كسبان" : "خسران"}</span>
        </div>
        <div className="mt-2 text-4xl font-extrabold num">{fmt(s.net)}</div>
        <div className="mt-1 text-sm opacity-90">مجمل الربح: <span className="num">{fmt(s.gross)}</span></div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="إجمالي المبيعات" value={fmt(s.sales)} />
        <Stat label="إجمالي التكلفة" value={fmt(s.cost)} />
        <Stat label="إجمالي المصاريف" value={fmt(s.expenses)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="عدد الطلبات" value={fmtNum(s.count)} />
        <Stat label="متوسط الربح للطلب" value={fmt(s.count ? s.net / s.count : 0)} />
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-bold">صافي الربح لكل شهر — {ym.slice(0, 4)}</h2>
        <div className="h-56" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={50} reversed />
              <YAxis tick={{ fontSize: 10 }} width={50} orientation="right" tickFormatter={(v) => fmtNum(v)} />
              <Tooltip formatter={(v: number) => fmt(v)} labelStyle={{ fontFamily: "Cairo" }} />
              <Bar dataKey="net" name="صافي الربح" radius={[6, 6, 0, 0]}>
                {chart.map((m, i) => (
                  <Cell key={i} fill={m.net >= 0 ? "var(--profit)" : "var(--loss)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-bold num break-words">{value}</div>
    </div>
  );
}
