import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Order = {
  id: string;
  order_date: string;
  order_number: string;
  total_price: number;
  cost: number;
};
export type Expense = {
  id: string;
  expense_date: string;
  category: string;
  amount: number;
  notes: string | null;
};

export const CATEGORIES = ["إعلانات", "شحن", "إيجار", "مرتبات", "اشتراكات", "أخرى"];
export const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
export const fmt = (n: number) => `${nf.format(n)} ج.م`;
export const fmtNum = (n: number) => nf.format(n);

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const currentYm = () => today().slice(0, 7);

export function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return [`${ym}-01`, `${next}-01`] as const;
}
export const ymLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

export const MonthCtx = createContext<{ ym: string; setYm: (v: string) => void }>({
  ym: currentYm(),
  setYm: () => {},
});
export const useMonth = () => useContext(MonthCtx);

async function fetchOrders(from: string, to: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_date, order_number, total_price, cost")
    .gte("order_date", from)
    .lt("order_date", to)
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((o) => ({ ...o, total_price: Number(o.total_price), cost: Number(o.cost) }));
}
async function fetchExpenses(from: string, to: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("id, expense_date, category, amount, notes")
    .gte("expense_date", from)
    .lt("expense_date", to)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((e) => ({ ...e, amount: Number(e.amount) }));
}

export const useOrders = (ym: string) =>
  useQuery({ queryKey: ["orders", ym], queryFn: () => fetchOrders(...monthRange(ym)) });
export const useExpenses = (ym: string) =>
  useQuery({ queryKey: ["expenses", ym], queryFn: () => fetchExpenses(...monthRange(ym)) });

export const useYear = (year: number) =>
  useQuery({
    queryKey: ["year", year],
    queryFn: async () => {
      const [orders, expenses] = await Promise.all([
        fetchOrders(`${year}-01-01`, `${year + 1}-01-01`),
        fetchExpenses(`${year}-01-01`, `${year + 1}-01-01`),
      ]);
      return { orders, expenses };
    },
  });

export type MonthStats = {
  count: number;
  sales: number;
  cost: number;
  gross: number;
  expenses: number;
  net: number;
};
export function stats(orders: Order[], expenses: Expense[]): MonthStats {
  const sales = orders.reduce((s, o) => s + o.total_price, 0);
  const cost = orders.reduce((s, o) => s + o.cost, 0);
  const exp = expenses.reduce((s, e) => s + e.amount, 0);
  const gross = sales - cost;
  return { count: orders.length, sales, cost, gross, expenses: exp, net: gross - exp };
}
export function yearly(orders: Order[], expenses: Expense[]) {
  return MONTHS.map((name, i) => {
    const mm = String(i + 1).padStart(2, "0");
    return {
      name,
      ...stats(
        orders.filter((o) => o.order_date.slice(5, 7) === mm),
        expenses.filter((e) => e.expense_date.slice(5, 7) === mm),
      ),
    };
  });
}

export const arError = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (/Invalid login/i.test(msg)) return "البريد الإلكتروني أو كلمة المرور غير صحيحة";
  if (/already registered/i.test(msg)) return "هذا البريد مسجل بالفعل";
  if (/Email not confirmed/i.test(msg)) return "من فضلك أكّد بريدك الإلكتروني أولاً";
  if (/Password should be/i.test(msg)) return "كلمة المرور ضعيفة، استخدم 6 أحرف على الأقل";
  return "حصلت مشكلة، حاول تاني";
};
