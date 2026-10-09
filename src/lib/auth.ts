export const expiredRecoveryMessage = "رابط استرجاع كلمة المرور منتهي أو غير صالح. اطلب رابط جديد.";

export function authErrorMessage(error: unknown): string {
  const value = error && typeof error === "object" ? error as { code?: string; message?: string; status?: number } : {};
  const code = value.code ?? "";
  const message = value.message ?? String(error);
  if (code === "invalid_credentials" || /Invalid login credentials/i.test(message)) return "البريد الإلكتروني أو كلمة المرور غير صحيحة. تقدر تستخدم «نسيت كلمة المرور؟».";
  if (code === "email_not_confirmed" || /Email not confirmed/i.test(message)) return "لازم تأكّد بريدك الإلكتروني الأول. افتح رسالة التأكيد في البريد أو الرسائل غير المرغوب فيها.";
  if (code === "user_already_exists" || /already registered/i.test(message)) return "البريد ده مسجل بالفعل. سجّل دخولك أو استرجع كلمة المرور.";
  if (code === "same_password") return "اختار كلمة مرور جديدة مختلفة عن القديمة.";
  if (code === "weak_password" || /Password should be/i.test(message)) return "كلمة المرور ضعيفة. استخدم كلمة أطول وأقوى.";
  if (["otp_expired", "otp_disabled", "session_not_found", "refresh_token_not_found", "refresh_token_already_used"].includes(code) || /Auth session missing|JWT expired/i.test(message)) return expiredRecoveryMessage;
  if (value.status === 429 || /rate_limit|over_request_rate_limit|over_email_send_rate_limit/.test(code) || /rate limit|after \d+ seconds/i.test(message)) return "محاولات كتير في وقت قصير. استنى شوية وبعدين جرّب تاني.";
  if (/Failed to fetch|NetworkError|network request|Load failed|timeout|timed out|AbortError/i.test(message)) return "تعذّر الاتصال بخدمة تسجيل الدخول. اتأكد من الإنترنت وجرّب تاني.";
  if (code === "email_address_not_authorized" || /Error sending|SMTP/i.test(message)) return "تعذّر إرسال الإيميل حاليًا. إعدادات إرسال البريد محتاجة مراجعة.";
  if (/Invalid API key|Missing Supabase environment|supabaseUrl|supabaseKey/i.test(message)) return "في مشكلة في إعدادات اتصال الموقع. محتاجة إصلاح من مسؤول الموقع.";
  if (typeof value.status === "number" && value.status >= 500) return "خدمة تسجيل الدخول فيها مشكلة مؤقتة. جرّب كمان شوية.";
  return "تعذّر إكمال العملية. جرّب تاني، ولو المشكلة مستمرة تواصل مع مسؤول الموقع.";
}

export function recoveryState(search: string, hash: string) {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  return {
    requested: query.get("recovery") === "1" || fragment.get("type") === "recovery",
    invalid: fragment.has("error") || fragment.has("error_code") || query.has("error") || query.has("error_code"),
  };
}
