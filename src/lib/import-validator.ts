import type { ColumnMapping, ValidatedRow } from "./import-types";

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

function coercePropertyType(val: string): "rental" | "association" {
  const v = val.toLowerCase();
  if (v.includes("assoc") || v.includes("hoa") || v.includes("condo")) return "association";
  return "rental";
}

export function validateImportRows(
  rows: Record<string, string>[],
  mappings: ColumnMapping[],
): ValidatedRow[] {
  const getVal = (row: Record<string, string>, schemaField: string): string => {
    const header = Object.keys(row).find(
      (h) => mappings.find((m) => m.csvHeader === h && m.schemaField === schemaField),
    );
    return header ? (row[header] ?? "").trim() : "";
  };

  return rows.map((row, rowIndex) => {
    const errors: ValidatedRow["errors"] = [];
    const warnings: ValidatedRow["warnings"] = [];

    const property_name = getVal(row, "property_name");
    const address = getVal(row, "address");
    const city = getVal(row, "city");
    const stateRaw = getVal(row, "state").toUpperCase();
    const zip = getVal(row, "zip");
    const unit_count_raw = getVal(row, "unit_count");
    const property_type_raw = getVal(row, "property_type");
    const manager_email_raw = getVal(row, "manager_email");

    if (!property_name) errors.push({ field: "property_name", message: "Property name is required" });
    if (property_name.length > 200) errors.push({ field: "property_name", message: "Property name too long (max 200)" });
    if (!address) errors.push({ field: "address", message: "Address is required" });
    if (!city) errors.push({ field: "city", message: "City is required" });

    if (!stateRaw) {
      errors.push({ field: "state", message: "State is required" });
    } else if (!US_STATES.has(stateRaw)) {
      errors.push({ field: "state", message: `"${stateRaw}" is not a valid 2-letter US state code` });
    }

    if (!zip) {
      errors.push({ field: "zip", message: "Zip code is required" });
    } else if (!/^\d{5}(-\d{4})?$/.test(zip)) {
      errors.push({ field: "zip", message: `"${zip}" is not a valid zip code` });
    }

    let unit_count = 1;
    if (unit_count_raw) {
      const parsed = parseInt(unit_count_raw, 10);
      if (isNaN(parsed) || parsed < 1) {
        errors.push({ field: "unit_count", message: `"${unit_count_raw}" is not a valid unit count` });
      } else {
        unit_count = parsed;
      }
    }

    const property_type = coercePropertyType(property_type_raw);
    if (property_type_raw && !["rental", "association"].includes(property_type_raw.toLowerCase())) {
      warnings.push({ field: "property_type", message: `"${property_type_raw}" mapped to "${property_type}"` });
    }

    const manager_emails: string[] = [];
    if (manager_email_raw) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      manager_email_raw.split(/[,;]/).forEach((e) => {
        const email = e.trim();
        if (email) {
          if (emailRegex.test(email)) {
            manager_emails.push(email);
          } else {
            warnings.push({ field: "manager_email", message: `"${email}" is not a valid email` });
          }
        }
      });
    }

    // Check for unmapped required fields
    const hasMapping = (field: string) => mappings.some((m) => m.schemaField === field);
    if (!hasMapping("property_name") && rowIndex === 0) {
      errors.push({ field: "property_name", message: "No column mapped to property name" });
    }

    return {
      rowIndex,
      data: {
        property_name,
        address,
        city,
        state: stateRaw,
        zip,
        unit_count,
        property_type,
        manager_emails,
      },
      errors,
      warnings,
    };
  });
}
