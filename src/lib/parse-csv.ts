export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
};

export type ParseError = {
  error: string;
};

const MAX_ROWS = 500;

function parseRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export function parseCsv(text: string): ParsedCsv | ParseError {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0);

  if (nonEmpty.length < 2) {
    return { error: "CSV must have a header row and at least one data row." };
  }

  const headers = parseRow(nonEmpty[0]).map((h) => h.replace(/^"|"$/g, ""));
  const dataLines = nonEmpty.slice(1);

  if (dataLines.length > MAX_ROWS) {
    return { error: `CSV exceeds maximum of ${MAX_ROWS} rows.` };
  }

  const rows: Record<string, string>[] = dataLines.map((line) => {
    const values = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = (values[i] ?? "").replace(/^"|"$/g, "");
    });
    return row;
  });

  return { headers, rows, rowCount: rows.length };
}
