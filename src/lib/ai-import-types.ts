import type { SupportedPropertyType } from "./property-types";

export type AiParsedUnit = {
  unit_number: string;
  bedrooms?: number;
  bathrooms?: number;
  square_feet?: number;
  rent_amount?: number;
  status?: "vacant" | "occupied" | "maintenance";
};

export type AiParsedProperty = {
  name: string;
  type: SupportedPropertyType;
  address: string;
  city: string;
  state: string;
  zip: string;
  description?: string;
  units?: AiParsedUnit[];
};

export type AiImportContext = {
  name?: string;
  type?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
};
