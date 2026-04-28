"use client";

import { useRouter } from "next/navigation";

type AccountsYearSelectProps = {
  selectedYear: number;
  yearOptions: number[];
  selectedRange?: string;
};

export function AccountsYearSelect({
  selectedYear,
  yearOptions,
  selectedRange,
}: AccountsYearSelectProps) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="accounts-year" className="text-sm font-medium text-slate-600">
        Year
      </label>
      <select
        id="accounts-year"
        name="year"
        defaultValue={selectedYear}
        onChange={(event) => {
          const params = new URLSearchParams({
            year: event.currentTarget.value,
          });
          if (selectedRange) {
            params.set("range", selectedRange);
          }

          router.replace(`/accounts?${params.toString()}`, {
            scroll: false,
          });
        }}
        className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
      >
        {yearOptions.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  );
}
