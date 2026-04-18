import { requireOrgAccess, isAccessError } from "@/lib/auth";
import { parseCsv } from "@/lib/parse-csv";
import { mapCsvColumns } from "@/lib/csv-mapper";
import { validateImportRows } from "@/lib/import-validator";
import type { ParseResponse } from "@/lib/import-types";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request) {
  const ctx = await requireOrgAccess();
  if (isAccessError(ctx)) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: "File exceeds 5MB limit" }, { status: 400 });
  }

  const text = await file.text();
  const parsed = parseCsv(text);

  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const { headers, rows } = parsed;
  const mappings = mapCsvColumns(headers);
  const validatedRows = validateImportRows(rows, mappings);

  const body: ParseResponse = { headers, mappings, validatedRows };
  return Response.json(body);
}
