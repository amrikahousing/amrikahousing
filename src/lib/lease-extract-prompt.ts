type JsonSchema = Record<string, unknown>;

export type AnthropicTool = {
  name: string;
  description: string;
  input_schema: JsonSchema;
};

const confidenceSchema = {
  type: "string",
  enum: ["low", "medium", "high"],
  description: "How confident you are that the value came from the correct part of the lease.",
};

const evidenceSchema = {
  type: "string",
  description:
    "A short supporting phrase from the document, not a long quote. Empty string if the value is not found.",
};

export const leaseOnboardingTool: AnthropicTool = {
  name: "extract_lease_onboarding_details",
  description: "Extract structured renter onboarding details from an executed residential lease document.",
  input_schema: {
    type: "object",
    properties: {
      propertyAddress: {
        type: "string",
        description:
          "The leased premises address only. Prefer text near Premises, Leased Premises, Property, Apartment, or Unit. Do not use landlord notice address, tenant mailing address, court venue, or broker address.",
      },
      propertyAddressConfidence: confidenceSchema,
      propertyAddressEvidence: evidenceSchema,
      unitNumber: {
        type: "string",
        description:
          "The leased unit/apartment number only. Look near the leased premises address, apartment/unit labels, or schedule of premises. Empty string if not found.",
      },
      unitNumberConfidence: confidenceSchema,
      unitNumberEvidence: evidenceSchema,
      firstName: {
        type: "string",
        description:
          "Primary tenant first name from the executed lease. Prefer named tenant/signatory sections. Empty string if not found.",
      },
      lastName: {
        type: "string",
        description:
          "Primary tenant last name from the executed lease. Prefer named tenant/signatory sections. Empty string if not found.",
      },
      email: {
        type: "string",
        description:
          "Primary tenant email visibly present in the lease. Empty string if not found. Do not invent an email.",
      },
      phone: {
        type: "string",
        description:
          "Primary tenant phone number visibly present in the lease. Empty string if not found. Do not invent a phone number.",
      },
      tenantEvidence: evidenceSchema,
      additionalTenants: {
        type: "array",
        description: "All other tenants listed on the executed lease besides the primary tenant. Empty array if none.",
        items: {
          type: "object",
          properties: {
            firstName: { type: "string", description: "Tenant first name. Empty string if not found." },
            lastName: { type: "string", description: "Tenant last name. Empty string if not found." },
            email: { type: "string", description: "Tenant email. Empty string if not found." },
            phone: { type: "string", description: "Tenant phone number. Empty string if not found." },
            evidence: evidenceSchema,
          },
          required: ["firstName", "lastName", "email", "phone", "evidence"],
        },
      },
      startDate: {
        type: "string",
        description:
          "Lease start/commencement date in YYYY-MM-DD format. Prefer the lease term section. Empty string if not found.",
      },
      startDateConfidence: confidenceSchema,
      startDateEvidence: evidenceSchema,
      endDate: {
        type: "string",
        description:
          "Lease end/expiration date in YYYY-MM-DD format. Empty string if month-to-month or not found.",
      },
      endDateConfidence: confidenceSchema,
      endDateEvidence: evidenceSchema,
      rentAmount: {
        type: "number",
        description:
          "Monthly rent amount as a number. Prefer recurring base rent, not deposit, total move-in cost, fees, or prorated rent. Use 0 if not found.",
      },
      rentAmountConfidence: confidenceSchema,
      rentAmountEvidence: evidenceSchema,
      securityDeposit: {
        type: "number",
        description: "Security deposit amount as a number. Use 0 if not found.",
      },
      securityDepositConfidence: confidenceSchema,
      securityDepositEvidence: evidenceSchema,
    },
    required: [
      "propertyAddress",
      "propertyAddressConfidence",
      "propertyAddressEvidence",
      "unitNumber",
      "unitNumberConfidence",
      "unitNumberEvidence",
      "firstName",
      "lastName",
      "email",
      "phone",
      "tenantEvidence",
      "additionalTenants",
      "startDate",
      "startDateConfidence",
      "startDateEvidence",
      "endDate",
      "endDateConfidence",
      "endDateEvidence",
      "rentAmount",
      "rentAmountConfidence",
      "rentAmountEvidence",
      "securityDeposit",
      "securityDepositConfidence",
      "securityDepositEvidence",
    ],
  },
};

const extractedTermsSchema = {
  type: "object",
  properties: {
    startDate: {
      type: "string",
      description:
        "Template default lease start date in YYYY-MM-DD format if present. Empty string if not present or tenant-specific.",
    },
    endDate: {
      type: "string",
      description:
        "Template default lease end date in YYYY-MM-DD format if present. Empty string if not present, month-to-month, or tenant-specific.",
    },
    propertyAddress: {
      type: "string",
      description:
        "Property address only if the uploaded document is clearly property-specific. Do not include unit number; ignore tenant mailing, landlord notice, court, or broker addresses.",
    },
    state: {
      type: "string",
      description: "Lease jurisdiction/state. Prefer governing law, premises address state, or statutory references.",
    },
    landlordName: {
      type: "string",
      description:
        "Legal landlord/lessor/owner entity from the parties section. Prefer text immediately before/after labels like Landlord, Lessor, Owner, Agent for Owner, or By and Between. If a property manager signs on behalf of an owner, return the owner/landlord entity, not the signer. Do not return tenant, broker, leasing agent, property manager, management company, or notice recipient unless the document explicitly says that party is the landlord/lessor/owner.",
    },
    landlordSignatory: {
      type: "string",
      description:
        "Full name of the individual person who signs on behalf of the landlord entity (e.g. 'AMIT LAKHOTIA' in a 'Name of Landlord' section that lists both an LLC and an individual). Only extract when a human name explicitly appears alongside or under the landlord/lessor entity label — never copy the entity name here. Empty string if no individual signatory is identified.",
    },
    leaseType: { type: "string", enum: ["fixed", "month-to-month", "unknown"] },
    leaseTerm: { type: "string", description: "Default lease duration (e.g. '12 months', '1 year'). Empty string if not specified or month-to-month." },
    gracePeriodDays: { type: "number", description: "Number of grace-period days before late fee. Use 0 if not found." },
    lateFeeFlat: { type: "number", description: "Flat late fee dollar amount. Use 0 if not found." },
    lateFeePct: { type: "number", description: "Late fee as a percentage of monthly rent. Use 0 if not found." },
    earlyTerminationFee: { type: "number", description: "Early lease termination flat fee amount. Use 0 if not found." },
    earlyTerminationMonths: { type: "number", description: "Early termination fee expressed as number of months rent (e.g. 2 for 'two months rent'). Use 0 if not found." },
    petFeeAmount: { type: "number", description: "Monthly or one-time pet fee amount. Use 0 if not found." },
  },
  required: [
    "startDate",
    "endDate",
    "propertyAddress",
    "state",
    "landlordName",
    "landlordSignatory",
    "leaseType",
    "leaseTerm",
    "gracePeriodDays",
    "lateFeeFlat",
    "lateFeePct",
    "earlyTerminationFee",
    "earlyTerminationMonths",
    "petFeeAmount",
  ],
};

const profileChoiceSchema = {
  type: "string",
  enum: ["yes", "no", "unknown"],
  description:
    "Use yes only when the lease clearly says this property-level setting applies, no only when the lease clearly says it does not apply or tenant is responsible, and unknown when not stated.",
};

export const leaseTemplateReviewTool: AnthropicTool = {
  name: "review_lease_document",
  description: "Review a residential lease template and extract reusable template details.",
  input_schema: {
    type: "object",
    properties: {
      extractedTerms: extractedTermsSchema,
      extractionEvidence: {
        type: "object",
        description: "Confidence and short evidence for the important extracted template terms.",
        properties: {
          propertyAddress: { type: "object", properties: { confidence: confidenceSchema, evidence: evidenceSchema }, required: ["confidence", "evidence"] },
          state: { type: "object", properties: { confidence: confidenceSchema, evidence: evidenceSchema }, required: ["confidence", "evidence"] },
          landlordName: { type: "object", properties: { confidence: confidenceSchema, evidence: evidenceSchema }, required: ["confidence", "evidence"] },
        },
        required: ["propertyAddress", "state", "landlordName"],
      },
      leaseProfileSuggestions: {
        type: "object",
        description:
          "Reusable property-level settings to prefill the lease template form. Do not include rent, deposit, unit-specific, or tenant-specific values.",
        properties: {
          propertyManagerName: {
            type: "string",
            description:
              "Full name of the individual property manager or their separate management company. Extract from labels like 'Property Manager', 'Agent', 'Point of Contact', or bilingual equivalents such as 'Point of Contact • Persona de contacto'. This party must be DIFFERENT from the landlord/lessor/owner — do NOT return the landlord entity name here even if the landlord is a company or LLC. If no separate property manager is identified, return empty string.",
          },
          propertyManagerEmail: {
            type: "string",
            description:
              "Email address of the property manager, agent, or point of contact. Extract from any email field in the landlord/manager/contact block. Return empty string if not found.",
          },
          propertyManagerPhone: {
            type: "string",
            description:
              "Phone number of the property manager, agent, or point of contact. Extract from labels like 'Voice or Text:', 'Phone:', 'Tel:', 'Call:', or any phone number in the landlord/manager/office contact block. Return empty string if not found.",
          },
          includesElectricity: profileChoiceSchema,
          includesHeat: profileChoiceSchema,
          includesGas: profileChoiceSchema,
          includesWater: profileChoiceSchema,
          includesSewer: profileChoiceSchema,
          includesTrash: profileChoiceSchema,
          includesInternet: profileChoiceSchema,
          includesCable: profileChoiceSchema,
          includesPhone: profileChoiceSchema,
          includesLaundry: profileChoiceSchema,
          includesParking: profileChoiceSchema,
          includesLawnCare: profileChoiceSchema,
          includesSnowRemoval: profileChoiceSchema,
          includesHoa: profileChoiceSchema,
          hasPetFee: profileChoiceSchema,
        },
        required: [
          "propertyManagerName",
          "propertyManagerEmail",
          "propertyManagerPhone",
          "includesElectricity",
          "includesHeat",
          "includesGas",
          "includesWater",
          "includesSewer",
          "includesTrash",
          "includesInternet",
          "includesCable",
          "includesPhone",
          "includesLaundry",
          "includesParking",
          "includesLawnCare",
          "includesSnowRemoval",
          "includesHoa",
          "hasPetFee",
        ],
      },
      ignoredTenantDetails: {
        type: "array",
        description:
          "Tenant-specific names, unit numbers, dates, and contact details you noticed but intentionally ignored because this is a reusable template.",
        items: {
          type: "object",
          properties: {
            field: { type: "string" },
            reason: { type: "string" },
          },
          required: ["field", "reason"],
        },
      },
      clauseSummaries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            riskLevel: { type: "string", enum: ["low", "medium", "high"] },
            explanation: { type: "string" },
          },
          required: ["title", "summary", "riskLevel", "explanation"],
        },
      },
      missingConcepts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            concept: { type: "string" },
            importance: { type: "string", enum: ["recommended", "important", "critical"] },
            description: { type: "string" },
          },
          required: ["concept", "importance", "description"],
        },
      },
      inconsistencies: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high"] },
          },
          required: ["description", "severity"],
        },
      },
      stateLawNotes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            area: { type: "string" },
            note: { type: "string" },
            risk: { type: "string", enum: ["info", "caution", "warning"] },
          },
          required: ["area", "note", "risk"],
        },
      },
      readabilitySuggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            section: { type: "string" },
            issue: { type: "string" },
            suggestion: { type: "string" },
          },
          required: ["section", "issue", "suggestion"],
        },
      },
      overallRiskLevel: { type: "string", enum: ["low", "medium", "high"] },
      executiveSummary: {
        type: "string",
        description:
          "2 sentences of context: overall quality and top concern. Then, if actions are needed, list them inline as: (1) first action (2) second action. Keep total under 80 words.",
      },
    },
    required: [
      "extractedTerms",
      "extractionEvidence",
      "leaseProfileSuggestions",
      "ignoredTenantDetails",
      "clauseSummaries",
      "missingConcepts",
      "inconsistencies",
      "stateLawNotes",
      "readabilitySuggestions",
      "overallRiskLevel",
      "executiveSummary",
    ],
  },
};

export function buildLeaseOnboardingSystemPrompt() {
  return (
    "You extract facts from executed residential lease documents for renter onboarding. " +
    "Tenant-specific information is expected and must be extracted when visibly present. " +
    "Only use values visible in the document; never guess. " +
    "If a field is absent, return an empty string or 0 as specified and confidence low. " +
    "Prefer the leased premises section over notice, mailing, broker, court, or landlord addresses. " +
    "Extract the primary tenant in the top-level tenant fields and every other named tenant in additionalTenants. " +
    "Dates must be YYYY-MM-DD. Amounts must be numeric without currency symbols."
  );
}

export function buildLeaseOnboardingUserPrompt() {
  return (
    "Extract lease details needed for renter onboarding from this executed lease. " +
    "Pay special attention to the leased premises address, unit number, tenant names/contact information, lease term, monthly rent, and security deposit. " +
    "Return short evidence for uncertain fields."
  );
}

export function buildLeaseTemplateReviewSystemPrompt() {
  return (
    "You are reviewing a residential lease document on behalf of a property manager to create a reusable lease template. " +
    "Tenant-specific and unit-specific values can appear if the uploaded document is an executed lease; do not copy tenant names, emails, phone numbers, signatures, unit numbers, tenant-specific dates, monthly rent, security deposit, move-in charges, or one-off fees into reusable template terms. " +
    "Instead, record those tenant-specific findings in ignoredTenantDetails when useful. " +
    "For propertyAddress, exclude unit numbers and addresses that are notice, mailing, broker, court, or tenant addresses. " +
    "For landlordName, look first in the parties clause or 'Name of Landlord' (or bilingual 'Name of Landlord • Nombre del propietario') section for the legal landlord/lessor/owner entity; avoid property manager and signer names unless explicitly named as landlord. " +
    "For landlordSignatory, if the 'Name of Landlord' section contains TWO values — an LLC/entity name AND an individual person's name — extract the individual's name into landlordSignatory (e.g. 'AMIT LAKHOTIA' when the section shows 'AVON TOWERS LLC' and 'AMIT LAKHOTIA'). Empty string if no individual is separately listed. " +
    "For leaseProfileSuggestions.propertyManagerName, look for labels like 'Property Manager', 'Agent', 'Point of Contact', or bilingual equivalents (e.g. 'Point of Contact • Persona de contacto'); this must be a DIFFERENT party from the landlord — never copy the landlord name into propertyManagerName. For leaseProfileSuggestions.propertyManagerPhone, extract from labels like 'Voice or Text:', 'Phone:', 'Tel:', 'Call:', or any phone number in the manager/landlord contact block. " +
    "For extractedTerms fee fields: extract gracePeriodDays, lateFeeFlat, lateFeePct, earlyTerminationFee, earlyTerminationMonths, and petFeeAmount from the relevant clauses; use 0 when not found. Extract leaseTerm as a plain string (e.g. '12 months') from the lease term or initial term clause. " +
    "For leaseProfileSuggestions, extract property-level utility and service responsibility. For each utility field (electricity, heat, gas, water, sewer, trash, internet, cable, phone, laundry, parking, lawnCare, snowRemoval, hoa): use 'yes' if the landlord/owner pays or includes it, 'no' if the tenant is responsible, and 'unknown' when not stated. CRITICAL PATTERN: When the lease has a checkbox/list of 'Utilities paid by tenant' or 'Tenant is responsible for', treat checked/listed items as 'no' (tenant pays) and ALL OTHER utilities mentioned in that same list but NOT checked/listed as 'yes' (landlord pays/included) — not unknown. Only use 'unknown' when the utility is completely absent from the lease. Sentences saying 'tenant pays X' mean 'no'; 'landlord provides X' or utility is absent from the tenant-responsibility list means 'yes'. " +
    "Be concise: return at most 8 clauseSummaries, 5 missingConcepts, 4 inconsistencies, 5 stateLawNotes, 4 readabilitySuggestions, and 8 ignoredTenantDetails. " +
    "Risk levels (low/medium/high) reflect risk TO THE PROPERTY MANAGER: high = exposes/disadvantages manager; medium = ambiguous; low = standard, required, or manager-favorable. " +
    "Do not flag legally required tenant protections as high risk. If state is uncertain, say state unknown and verify with local counsel. " +
    "This analysis is informational only and does not constitute legal advice."
  );
}

export function buildLeaseTemplateReviewUserPrompt(input: { hasDocxText: boolean; text?: string }) {
  const instructions =
    "Analyze this lease for reusable template creation. Extract reusable property/template terms, property-level profile suggestions, clauses, missing standard provisions, inconsistencies, state-law notes, and readability improvements. Ignore unit-specific and tenant-specific information for template fields, including monthly rent and security deposit values from an executed lease.";

  if (input.hasDocxText) {
    return `The following is the full text of a residential lease document:\n\n${input.text ?? ""}\n\n${instructions}`;
  }

  return instructions;
}
