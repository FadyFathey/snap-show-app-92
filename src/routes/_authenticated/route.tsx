import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, LayoutDashboard, LogOut, Receipt, ShoppingBag, Store, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MonthCtx, currentYm } from "@/lib/pl";
import { recoveryState } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Supabase can fall back to Site URL when a redirect is not allowlisted.
    // Preserve recovery tokens until /auth lets the SDK consume them.
    const recovery = recoveryState(window.location.search, window.location.hash);
    if (recovery.requested || recovery.invalid) {
      throw redirect({ to: "/auth", search: recovery.invalid ? { recovery: "1", error_code: "otp_expired" } : { recovery: "1" }, hash: window.location.hash.slice(1), replace: true });
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppShell,
});

const tabs = [
  { to: "/", label: "الرئيسية", icon: LayoutDashboard },
  { to: "/orders", label: "الطلبات", icon: ShoppingBag },
  { to: "/returns", label: "المرتجعات", icon: Undo2 },
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
          <div className="flex items-center gap-4">
            <Link to="/shopify" className="flex items-center gap-1 text-sm text-muted-foreground">
              <Store className="h-4 w-4" /> ربط شوبيفاي
            </Link>
            <button onClick={signOut} className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="خروج">
              <LogOut className="h-4 w-4" /> خروج
            </button>
          </div>
        </header>
        <Outlet />
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-5">
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
