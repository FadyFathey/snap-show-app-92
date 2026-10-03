import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, LayoutDashboard, LogOut, Receipt, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MonthCtx, currentYm } from "@/lib/pl";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppShell,
});

const tabs = [
  { to: "/", label: "الرئيسية", icon: LayoutDashboard },
  { to: "/orders", label: "الطلبات", icon: ShoppingBag },
  { to: "/expenses", label: "المصاريف", icon: Receipt },
  { to: "/summary", label: "الملخص", icon: BarChart3 },
] as const;

function AppShell() {
  const [ym, setYm] = useState(currentYm());
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <MonthCtx.Provider value={{ ym, setYm }}>
      <div className="mx-auto min-h-screen max-w-2xl pb-24">
        <header className="flex items-center justify-between px-5 pb-2 pt-5">
          <span className="text-lg font-bold">حسابات المتجر</span>
          <button onClick={signOut} className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="خروج">
            <LogOut className="h-4 w-4" /> خروج
          </button>
        </header>
        <Outlet />
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {tabs.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: true }}
              className="flex flex-col items-center gap-1 py-3 text-xs text-muted-foreground"
              activeProps={{ className: "text-primary font-bold" }}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </MonthCtx.Provider>
  );
}
