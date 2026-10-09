import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authErrorMessage, expiredRecoveryMessage, recoveryState } from "@/lib/auth";
import { Eye, EyeOff } from "lucide-react";

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

const emailSchema = z.string().trim().email("اكتب بريد إلكتروني صحيح").max(255);
const passwordSchema = z.string().min(6, "كلمة المرور 6 أحرف على الأقل").max(72, "كلمة المرور بحد أقصى 72 حرف");
type Mode = "in" | "up" | "forgot" | "reset";

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [sent, setSent] = useState<"confirmation" | "recovery" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const recovery = recoveryState(window.location.search, window.location.hash);
    let recovering = recovery.requested;
    // Subscribe before initialization completes. Never call async auth methods in this callback.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (active && event === "PASSWORD_RECOVERY") {
        recovering = true;
        setMode("reset");
      }
    });
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (recovery.invalid || (recovering && (!data.session || sessionError))) {
        setMode("forgot");
        setError(expiredRecoveryMessage);
      } else if (recovering) {
        setMode("reset");
      } else if (data.session) {
        void navigate({ to: "/", replace: true });
      } else if (sessionError) {
        setError(authErrorMessage(sessionError));
      }
      // The SDK has consumed the link; remove tokens/errors from browser history.
      if (recovering || recovery.invalid) {
        const url = new URL(window.location.href);
        url.hash = "";
        url.searchParams.delete("error");
        url.searchParams.delete("error_code");
        url.searchParams.delete("error_description");
        if (recovering && data.session && !recovery.invalid) url.searchParams.set("recovery", "1");
        else url.searchParams.delete("recovery");
        window.history.replaceState(window.history.state, "", url);
      }
    }).catch((err: unknown) => {
      if (active) setError(authErrorMessage(err));
    }).finally(() => {
      if (active) setInitializing(false);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [navigate]);

  function changeMode(next: Mode) {
    setMode(next);
    setError("");
    setSent(null);
    setPassword("");
    setConfirmation("");
    setShowPassword(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || initializing) return;
    setError("");
    const parsedEmail = emailSchema.safeParse(email);
    if (mode !== "reset" && !parsedEmail.success) {
      setError(parsedEmail.error.issues[0]?.message ?? "اكتب بريد إلكتروني صحيح");
      return;
    }
    if (mode !== "forgot") {
      // Login must accept existing passwords; new passwords get the current validation.
      const parsedPassword = (mode === "in" ? z.string().min(1, "اكتب كلمة المرور") : passwordSchema).safeParse(password);
      if (!parsedPassword.success) { setError(parsedPassword.error.issues[0]?.message ?? "راجع كلمة المرور"); return; }
    }
    if (mode === "reset" && password !== confirmation) { setError("كلمتا المرور مش متطابقتين"); return; }
    setBusy(true);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setPassword("");
        setConfirmation("");
        toast.success("تم تغيير كلمة المرور بنجاح");
        await navigate({ to: "/", replace: true });
      } else if (parsedEmail.success) {
        const credentials = { email: parsedEmail.data, password };
        if (mode === "forgot") {
          const { error } = await supabase.auth.resetPasswordForEmail(parsedEmail.data, {
            redirectTo: `${window.location.origin}/auth?recovery=1`,
          });
          if (error) throw error;
          setSent("recovery");
        } else if (mode === "in") {
          const { error } = await supabase.auth.signInWithPassword(credentials);
          if (error) throw error;
          toast.success("أهلاً بيك!");
          await navigate({ to: "/", replace: true });
        } else {
          const { data, error } = await supabase.auth.signUp({
            ...credentials,
            options: { emailRedirectTo: `${window.location.origin}/auth` },
          });
          if (error) throw error;
          if (data.session) await navigate({ to: "/", replace: true });
          else setSent("confirmation");
        }
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === "forgot" ? "استرجاع كلمة المرور" : mode === "reset" ? "كلمة مرور جديدة" : mode === "up" ? "إنشاء حساب" : "تسجيل الدخول";
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">ج.م</div>
          <h1 className="text-2xl font-bold">حسابات المتجر</h1>
          <p className="mt-1 text-sm text-muted-foreground">اعرف كل شهر: كسبان ولا خسران؟</p>
        </div>
        {sent ? (
          <div className="rounded-2xl border bg-card p-6 text-center" role="status">
            <h2 className="font-semibold">راجع بريدك الإلكتروني</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {sent === "recovery"
                ? "لو البريد ده مسجل، هيوصلك رابط لتعيين كلمة مرور جديدة. راجع صندوق الوارد والرسائل غير المرغوب فيها، وافتح أحدث رابط وصلك."
                : "راجع رسالة تأكيد الحساب في بريدك الإلكتروني واضغط على الرابط علشان تقدر تسجّل دخولك."}
            </p>
            <Button variant="outline" className="mt-4 w-full" onClick={() => changeMode("in")}>رجوع لتسجيل الدخول</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-card p-6" aria-busy={busy || initializing}>
            <h2 className="text-lg font-semibold">{heading}</h2>
            {mode === "forgot" && <p className="text-sm text-muted-foreground">اكتب بريد حسابك وهنبعتلك رابط تغيّر منه كلمة المرور.</p>}
            {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            {mode !== "reset" && <div className="space-y-1.5">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" disabled={busy || initializing} />
            </div>}
            {mode !== "forgot" && <div className="space-y-1.5">
              <Label htmlFor="pw">{mode === "reset" ? "كلمة المرور الجديدة" : "كلمة المرور"}</Label>
              <div className="relative">
                <Input id="pw" name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "in" ? "current-password" : "new-password"} required dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 pr-12" disabled={busy || initializing} />
                <button type="button" aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground" disabled={busy || initializing}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {mode !== "in" && <p className="text-xs text-muted-foreground">6 أحرف على الأقل، واختار كلمة قوية ومختلفة.</p>}
            </div>}
            {mode === "reset" && <div className="space-y-1.5">
              <Label htmlFor="confirm-pw">تأكيد كلمة المرور الجديدة</Label>
              <Input id="confirm-pw" name="confirm-password" type={showPassword ? "text" : "password"} autoComplete="new-password" required dir="ltr" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="h-12" disabled={busy || initializing} />
            </div>}
            {mode === "in" && <button type="button" disabled={busy || initializing} className="text-sm font-medium text-primary hover:underline" onClick={() => changeMode("forgot")}>نسيت كلمة المرور؟</button>}
            <Button type="submit" disabled={busy || initializing} className="h-12 w-full text-base">
              {initializing ? "جاري التحقق…" : busy ? "جاري التنفيذ…" : mode === "in" ? "دخول" : mode === "up" ? "إنشاء حساب" : mode === "forgot" ? "إرسال رابط الاسترجاع" : "حفظ كلمة المرور الجديدة"}
            </Button>
            {mode !== "reset" && <button type="button" disabled={busy || initializing} className="w-full text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => changeMode(mode === "in" ? "up" : "in")}>
              {mode === "in" ? "معندكش حساب؟ اعمل حساب جديد" : "رجوع لتسجيل الدخول"}
            </button>}
          </form>
        )}
      </div>
    </main>
  );
}
