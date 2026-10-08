import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OrderStatus = "new" | "shipped" | "returned" | "cancelled";
export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "جديد", shipped: "طلع", returned: "مرتجع", cancelled: "ملغي",
};
export type Order = {
  id: string;
  order_date: string;
  order_number: string;
  total_price: number;
  cost: number;
  status: OrderStatus;
  source: string;
  cost_missing: boolean;
  created_at: string;
  return_balance?: number;
  shipping_collected?: number;
};
export type Expense = {
  id: string;
  expense_date: string;
  category: string;
  amount: number;
  notes: string | null;
};
export type Return = {
  id: string;
  order_id: string;
  return_date: string;
  reason: string;
  notes: string | null;
  shipping_loss: number;
  shipping_collected: number;
  product_loss: number;
  restocked: boolean;
  order_number: string;
  order_date: string;
};
export const returnNetLoss = (r: Pick<Return, "shipping_loss" | "product_loss" | "shipping_collected">) =>
  r.shipping_loss + r.product_loss - (r.shipping_collected ?? 0);

export const RETURN_REASONS = ["العميل رفض الاستلام", "منتج معيب", "مقاس/لون غلط", "العميل غير متاح", "أخرى"];

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
  const [y = 2026, m = 1] = ym.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return [`${ym}-01`, `${next}-01`] as const;
}
export const ymLabel = (ym: string) => {
  const [y = 2026, m = 1] = ym.split("-").map(Number);
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
    .select("id, order_date, order_number, total_price, cost, status, source, cost_missing, created_at, returns(shipping_loss, product_loss, shipping_collected)")
    .gte("order_date", from)
    .lt("order_date", to)
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((o) => {
    const r = o.returns;
    return { ...o, status: o.status as OrderStatus, total_price: Number(o.total_price), cost: Number(o.cost),
      return_balance: r ? Number(r.shipping_collected) - Number(r.shipping_loss) - Number(r.product_loss) : 0,
      shipping_collected: r ? Number(r.shipping_collected) : 0,
    };
  });
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
async function fetchReturns(from: string, to: string): Promise<Return[]> {
  const { data, error } = await supabase
    .from("returns")
    .select("id, order_id, return_date, reason, notes, shipping_loss, shipping_collected, product_loss, restocked, orders(order_number, order_date)")
    .gte("return_date", from)
    .lt("return_date", to)
    .order("return_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const o = r.orders as { order_number: string; order_date: string } | null;
    return {
      id: r.id, order_id: r.order_id, return_date: r.return_date, reason: r.reason, notes: r.notes, restocked: r.restocked,
      shipping_loss: Number(r.shipping_loss), shipping_collected: Number(r.shipping_collected), product_loss: Number(r.product_loss),
      order_number: o?.order_number ?? "", order_date: o?.order_date ?? "",
    };
  });
}

export const useOrders = (ym: string) =>
  useQuery({ queryKey: ["orders", ym], queryFn: () => fetchOrders(...monthRange(ym)) });
export const useExpenses = (ym: string) =>
  useQuery({ queryKey: ["expenses", ym], queryFn: () => fetchExpenses(...monthRange(ym)) });
export const useReturns = (ym: string) =>
  useQuery({ queryKey: ["returns", ym], queryFn: () => fetchReturns(...monthRange(ym)) });

export const useYear = (year: number) =>
  useQuery({
    queryKey: ["year", year],
    queryFn: async () => {
      const r = [`${year}-01-01`, `${year + 1}-01-01`] as const;
      const [orders, expenses, returns] = await Promise.all([fetchOrders(...r), fetchExpenses(...r), fetchReturns(...r)]);
      return { orders, expenses, returns };
    },
  });

export type MonthStats = {
  count: number;
  sales: number;
  cost: number;
  gross: number;
  expenses: number;
  returnLoss: number;
  returnsCount: number;
  returnRate: number;
  pendingCount: number;
  pendingValue: number;
  net: number;
};
/** Only shipped orders count. Return losses count in the month of the return date. */
export function stats(orders: Order[], expenses: Expense[], returns: Return[] = []): MonthStats {
  const shipped = orders.filter((o) => o.status === "shipped");
  const pending = orders.filter((o) => o.status === "new");
  const returnedOrders = orders.filter((o) => o.status === "returned").length;
  const sales = shipped.reduce((s, o) => s + o.total_price, 0);
  const cost = shipped.reduce((s, o) => s + o.cost, 0);
  const exp = expenses.reduce((s, e) => s + e.amount, 0);
  const returnLoss = returns.reduce((s, r) => s + returnNetLoss(r), 0);
  const gross = sales - cost;
  const denom = shipped.length + returnedOrders;
  return {
    count: shipped.length, sales, cost, gross, expenses: exp, returnLoss,
    returnsCount: returns.length,
    returnRate: denom ? (returnedOrders / denom) * 100 : 0,
    pendingCount: pending.length,
    pendingValue: pending.reduce((s, o) => s + o.total_price, 0),
    net: gross - exp - returnLoss,
  };
}
export function yearly(orders: Order[], expenses: Expense[], returns: Return[] = []) {
  return MONTHS.map((name, i) => {
    const mm = String(i + 1).padStart(2, "0");
    return {
      name,
      ...stats(
        orders.filter((o) => o.order_date.slice(5, 7) === mm),
        expenses.filter((e) => e.expense_date.slice(5, 7) === mm),
        returns.filter((r) => r.return_date.slice(5, 7) === mm),
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
