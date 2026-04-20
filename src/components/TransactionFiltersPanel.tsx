"use client";

import Link from "next/link";
import { useState } from "react";

type Filters = {
  bank: string;
  account: string;
  category: string;
  type: string;
  year: string;
  from: string;
  to: string;
  q: string;
};

type TransactionFiltersPanelProps = {
  filters: Filters;
  banks: string[];
  accounts: string[];
  categories: string[];
  years: number[];
};

const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15";

function buildUrl(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return `/accounts/transactions${qs ? `?${qs}` : ""}`;
}

export function TransactionFiltersPanel({
  filters,
  banks,
  accounts,
  categories,
  years,
}: TransactionFiltersPanelProps) {
  const dropdownFilterCount =
    (filters.bank ? 1 : 0) +
    (filters.account ? 1 : 0) +
    (filters.category ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.year ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0);

  const [filtersOpen, setFiltersOpen] = useState(dropdownFilterCount > 0);

  const activeFilterChips: Array<{ key: keyof Filters; label: string }> = [
    filters.q.trim() ? { key: "q", label: `Search: ${filters.q.trim()}` } : null,
    filters.bank ? { key: "bank", label: `Bank: ${filters.bank}` } : null,
    filters.account ? { key: "account", label: `Account: ${filters.account}` } : null,
    filters.category ? { key: "category", label: `Category: ${filters.category}` } : null,
    filters.type ? { key: "type", label: `Type: ${filters.type}` } : null,
    filters.year ? { key: "year", label: `Year: ${filters.year}` } : null,
    filters.from ? { key: "from", label: `From: ${filters.from}` } : null,
    filters.to ? { key: "to", label: `To: ${filters.to}` } : null,
  ].filter(Boolean) as Array<{ key: keyof Filters; label: string }>;

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <form action="/accounts/transactions" className="space-y-4 p-5">
        {/* Search + Filters toggle — always visible */}
        <div className="flex gap-3">
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Search vendor, property, category…"
            className={`${inputClass} flex-1`}
          />
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className={`flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
              filtersOpen || dropdownFilterCount > 0
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Filters
            {dropdownFilterCount > 0 ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">
                {dropdownFilterCount}
              </span>
            ) : null}
          </button>
        </div>

        {/* When collapsed, preserve active filter values as hidden inputs so Apply still works */}
        {!filtersOpen ? (
          <>
            {filters.bank ? <input type="hidden" name="bank" value={filters.bank} /> : null}
            {filters.account ? <input type="hidden" name="account" value={filters.account} /> : null}
            {filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}
            {filters.type ? <input type="hidden" name="type" value={filters.type} /> : null}
            {filters.year ? <input type="hidden" name="year" value={filters.year} /> : null}
            {filters.from ? <input type="hidden" name="from" value={filters.from} /> : null}
            {filters.to ? <input type="hidden" name="to" value={filters.to} /> : null}
          </>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Bank</span>
              <select name="bank" defaultValue={filters.bank} className={inputClass}>
                <option value="">All banks</option>
                {banks.map((bank) => (
                  <option key={bank} value={bank}>
                    {bank}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Account</span>
              <select name="account" defaultValue={filters.account} className={inputClass}>
                <option value="">All accounts</option>
                {accounts.map((account) => (
                  <option key={account} value={account}>
                    {account}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Category</span>
              <select
                name="category"
                defaultValue={filters.category}
                className={`${inputClass} capitalize`}
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Type</span>
              <select name="type" defaultValue={filters.type} className={inputClass}>
                <option value="">Income and expenses</option>
                <option value="income">Income only</option>
                <option value="expense">Expenses only</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Year</span>
              <select name="year" defaultValue={filters.year} className={inputClass}>
                <option value="">All years</option>
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">From</span>
              <input
                name="from"
                type="date"
                defaultValue={filters.from}
                className={inputClass}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">To</span>
              <input
                name="to"
                type="date"
                defaultValue={filters.to}
                className={inputClass}
              />
            </label>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="h-10 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Apply filters
          </button>
          <Link
            href="/accounts/transactions"
            className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Reset
          </Link>
        </div>
      </form>

      {activeFilterChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 pb-4">
          {activeFilterChips.map(({ key, label }) => (
            <Link
              key={key}
              href={buildUrl({ ...filters, [key]: "" })}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
            >
              {label}
              <span aria-hidden>×</span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
