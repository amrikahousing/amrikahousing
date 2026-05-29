import { prisma } from "@/lib/db";

type ReviewWithStateNotes = {
  extractedTerms?: {
    state?: unknown;
  };
  stateLawNotes?: Array<{
    area?: unknown;
    note?: unknown;
    risk?: unknown;
  }>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRisk(value: unknown) {
  const risk = clean(value).toLowerCase();
  return risk === "warning" || risk === "caution" || risk === "info" ? risk : "info";
}

export async function syncStateSpecificLeaseClauses({
  organizationId,
  propertyState,
  reviewData,
}: {
  organizationId: string;
  propertyState?: string | null;
  reviewData?: ReviewWithStateNotes | object | null;
}) {
  const review = reviewData as ReviewWithStateNotes | null | undefined;
  const state = (clean(review?.extractedTerms?.state) || clean(propertyState)).toUpperCase();
  const notes = review?.stateLawNotes ?? [];
  if (!state || notes.length === 0) return 0;

  let count = 0;
  for (const item of notes) {
    const area = clean(item.area);
    const note = clean(item.note);
    if (!area || !note) continue;
    await prisma.lease_state_specific_clauses.upsert({
      where: {
        organization_id_state_area: {
          organization_id: organizationId,
          state,
          area,
        },
      },
      create: {
        organization_id: organizationId,
        state,
        area,
        note,
        risk: normalizeRisk(item.risk),
      },
      update: {
        note,
        risk: normalizeRisk(item.risk),
        updated_at: new Date(),
      },
    });
    count += 1;
  }

  return count;
}
