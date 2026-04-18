export type ColumnMapping = {
  csvHeader: string;
  schemaField: string | null;
  confidence: "high" | "medium" | "low";
};

export type ValidatedRow = {
  rowIndex: number;
  data: {
    property_name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    unit_count: number;
    property_type: "rental" | "association";
    manager_emails: string[];
  };
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
};

export type ImportSession = {
  headers: string[];
  mappings: ColumnMapping[];
  validatedRows: ValidatedRow[];
};

export type ParseResponse = {
  headers: string[];
  mappings: ColumnMapping[];
  validatedRows: ValidatedRow[];
};

export type ImportResult = {
  importedCount: number;
  propertyIds: string[];
  skippedCount: number;
};
