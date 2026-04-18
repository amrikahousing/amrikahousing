import type { ColumnMapping } from "./import-types";

type FieldRule = {
  field: string;
  patterns: RegExp[];
};

const FIELD_RULES: FieldRule[] = [
  {
    field: "property_name",
    patterns: [/prop.*name/i, /property.*name/i, /^name$/i, /^prop$/i, /^property$/i, /building.*name/i],
  },
  {
    field: "address",
    patterns: [/^address$/i, /street/i, /addr/i, /^location$/i],
  },
  {
    field: "city",
    patterns: [/^city$/i, /^town$/i, /^municipality$/i],
  },
  {
    field: "state",
    patterns: [/^state$/i, /^st$/i, /^province$/i, /^region$/i],
  },
  {
    field: "zip",
    patterns: [/^zip/i, /^postal/i, /^zip.*code$/i, /^postcode$/i],
  },
  {
    field: "unit_count",
    patterns: [/unit.*count/i, /num.*unit/i, /^units$/i, /^# of unit/i, /^unit #$/i, /^#.*unit/i, /^total.*unit/i],
  },
  {
    field: "property_type",
    patterns: [/^type$/i, /property.*type/i, /^kind$/i, /^category$/i],
  },
  {
    field: "manager_email",
    patterns: [/manager.*email/i, /contact.*email/i, /^email$/i, /^e-mail$/i, /^manager$/i],
  },
];

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function matchField(header: string): { field: string; confidence: ColumnMapping["confidence"] } | null {
  const normalized = header.toLowerCase().trim();

  for (const rule of FIELD_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(normalized)) {
        return { field: rule.field, confidence: "high" };
      }
    }
  }

  // Fuzzy match against canonical field names
  const canonicalNames = FIELD_RULES.map((r) => r.field);
  let bestField: string | null = null;
  let bestDist = Infinity;

  for (const canonical of canonicalNames) {
    const dist = levenshtein(normalized, canonical.replace(/_/g, " "));
    if (dist < bestDist) {
      bestDist = dist;
      bestField = canonical;
    }
  }

  if (bestDist <= 2 && bestField) {
    return { field: bestField, confidence: "medium" };
  }

  return null;
}

export function mapCsvColumns(headers: string[]): ColumnMapping[] {
  const usedFields = new Set<string>();

  return headers.map((header) => {
    const match = matchField(header);
    if (match && !usedFields.has(match.field)) {
      usedFields.add(match.field);
      return { csvHeader: header, schemaField: match.field, confidence: match.confidence };
    }
    return { csvHeader: header, schemaField: null, confidence: "low" };
  });
}
