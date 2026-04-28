"use client";

import { useRouter } from "next/navigation";

type ChartRange = "3m" | "6m" | "12m" | "ytd";

type AccountsRangeSelectProps = {
  selectedRange: ChartRange;
  selectedYear: number;
};

const options: Array<{ id: ChartRange; label: string }> = [
  { id: "3m", label: "3M" },
  { id: "6m", label: "6M" },
  { id: "12m", label: "12M" },
  { id: "ytd", label: "YTD" },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function AccountsRangeSelect({ selectedRange, selectedYear }: AccountsRangeSelectProps) {
  const router = useRouter();

  return (
    <div className="inline-flex h-12 items-center rounded-2xl border border-stone-200 bg-stone-50 p-1 text-xs font-medium text-slate-500 shadow-sm sm:text-sm">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => {
            const params = new URLSearchParams({
              year: String(selectedYear),
              range: option.id,
            });
            router.replace(`/accounts?${params.toString()}`, { scroll: false });
          }}
          className={cx(
            "inline-flex h-10 items-center rounded-xl px-4 sm:px-5",
            selectedRange === option.id
              ? "bg-white text-slate-950 shadow-sm ring-1 ring-stone-200"
              : "text-slate-500 hover:text-slate-700",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
