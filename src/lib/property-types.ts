export const PROPERTY_TYPE_OPTIONS = [
  { value: "multi-family", label: "Multi-family" },
] as const;

export type SupportedPropertyType = (typeof PROPERTY_TYPE_OPTIONS)[number]["value"];

export function isSupportedPropertyType(value: string | null | undefined): value is SupportedPropertyType {
  return PROPERTY_TYPE_OPTIONS.some((option) => option.value === value);
}

export function normalizePropertyType(value?: string | null): SupportedPropertyType {
  if (isSupportedPropertyType(value)) return value;
  return PROPERTY_TYPE_OPTIONS[0].value;
}

export function getPropertyTypeLabel(value: string | null | undefined): string {
  return PROPERTY_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? PROPERTY_TYPE_OPTIONS[0].label;
}
