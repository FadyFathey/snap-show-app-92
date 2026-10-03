import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMonth, ymLabel } from "@/lib/pl";

function shift(ym: string, d: number) {
  const [y = 2026, m = 1] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + d;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export function MonthPicker() {
  const { ym, setYm } = useMonth();
  return (
    <div className="flex items-center justify-between rounded-2xl border bg-card px-2 py-1.5">
      <button className="rounded-xl p-2 hover:bg-muted" onClick={() => setYm(shift(ym, -1))} aria-label="الشهر السابق">
        <ChevronRight className="h-5 w-5" />
      </button>
      <label className="relative cursor-pointer text-base font-bold">
        {ymLabel(ym)}
        <input
          type="month"
          value={ym}
          onChange={(e) => e.target.value && setYm(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="اختر الشهر"
        />
      </label>
      <button className="rounded-xl p-2 hover:bg-muted" onClick={() => setYm(shift(ym, 1))} aria-label="الشهر التالي">
        <ChevronLeft className="h-5 w-5" />
      </button>
    </div>
  );
}

export function YearPicker() {
  const { ym, setYm } = useMonth();
  const y = Number(ym.slice(0, 4));
  const m = ym.slice(5);
  return (
    <div className="flex items-center justify-between rounded-2xl border bg-card px-2 py-1.5">
      <button className="rounded-xl p-2 hover:bg-muted" onClick={() => setYm(`${y - 1}-${m}`)} aria-label="السنة السابقة">
        <ChevronRight className="h-5 w-5" />
      </button>
      <span className="text-base font-bold num">{y}</span>
      <button className="rounded-xl p-2 hover:bg-muted" onClick={() => setYm(`${y + 1}-${m}`)} aria-label="السنة التالية">
        <ChevronLeft className="h-5 w-5" />
      </button>
    </div>
  );
}
