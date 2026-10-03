import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { arError } from "@/lib/pl";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — حسابات المتجر" },
      { name: "description", content: "سجّل دخولك لمتابعة مكسب وخسارة متجرك كل شهر." },
      { property: "og:title", content: "تسجيل الدخول — حسابات المتجر" },
      { property: "og:description", content: "سجّل دخولك لمتابعة مكسب وخسارة متجرك كل شهر." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("اكتب بريد إلكتروني صحيح").max(255),
  password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل").max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) throw error;
        toast.success("أهلاً بيك!");
        navigate({ to: "/", replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          ...parsed.data,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/", replace: true });
        else setSent(true);
      }
    } catch (err) {
      toast.error(arError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
            ج.م
          </div>
          <h1 className="text-2xl font-bold">حسابات المتجر</h1>
          <p className="mt-1 text-sm text-muted-foreground">اعرف كل شهر: كسبان ولا خسران؟</p>
        </div>
        {sent ? (
          <div className="rounded-2xl border bg-card p-6 text-center">
            <p className="font-semibold">راجع بريدك الإلكتروني</p>
            <p className="mt-2 text-sm text-muted-foreground">
              بعتنالك رابط تأكيد على {email}. اضغط عليه وبعدين سجّل دخولك.
            </p>
            <Button variant="outline" className="mt-4 w-full" onClick={() => { setSent(false); setMode("in"); }}>
              رجوع لتسجيل الدخول
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-card p-6">
            <div className="space-y-1.5">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input id="email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw">كلمة المرور</Label>
              <Input id="pw" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" />
            </div>
            <Button type="submit" disabled={busy} className="h-12 w-full text-base">
              {mode === "in" ? "دخول" : "إنشاء حساب"}
            </Button>
            <button
              type="button"
              className="w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setMode(mode === "in" ? "up" : "in")}
            >
              {mode === "in" ? "معندكش حساب؟ اعمل حساب جديد" : "عندك حساب؟ سجّل دخول"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
