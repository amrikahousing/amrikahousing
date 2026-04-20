export const ACCOUNTING_CATEGORY_OPTIONS = [
  "Income",
  "Rent",
  "Rent and utilities",
  "Repairs and maintenance",
  "Supplies",
  "Insurance",
  "Property taxes",
  "Mortgage",
  "Bank fees",
  "Loan payments",
  "Professional services",
  "Technology",
  "Software",
  "Marketing",
  "Payroll",
  "Office expenses",
  "Travel",
  "Meals",
  "Transportation",
  "Utilities",
  "Home improvement",
  "General merchandise",
  "Government and non-profit",
  "Medical",
  "Personal care",
  "Transfer in",
  "Transfer out",
  "Uncategorized",
];

export function mergeAccountingCategoryOptions(categories: string[]) {
  const optionsByKey = new Map<string, string>();

  for (const category of [...ACCOUNTING_CATEGORY_OPTIONS, ...categories]) {
    const normalizedCategory = category.trim().replace(/\s+/g, " ");
    if (!normalizedCategory) continue;

    const key = normalizedCategory.toLowerCase();
    if (!optionsByKey.has(key)) {
      optionsByKey.set(key, normalizedCategory);
    }
  }

  return Array.from(optionsByKey.values()).sort((a, b) => a.localeCompare(b));
}

export function cleanAccountingCategory(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 80);
}

export function canonicalAccountingCategory(
  category: string,
  categoryOptions: string[] = ACCOUNTING_CATEGORY_OPTIONS,
) {
  const cleaned = cleanAccountingCategory(category);
  if (!cleaned) return "";

  const existing = categoryOptions.find(
    (option) => option.trim().toLowerCase() === cleaned.toLowerCase(),
  );

  return existing ?? cleaned;
}
