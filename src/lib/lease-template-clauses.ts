import type { Prisma } from "@/generated/prisma/client";
import type { ExtractedLeaseSchema } from "@/lib/fill-lease";

type LeaseReviewData = {
  clauseSummaries?: Array<{
    title?: unknown;
    summary?: unknown;
    riskLevel?: unknown;
    explanation?: unknown;
  }>;
};

type SyncLeaseTemplateClausesInput = {
  tx?: Prisma.TransactionClient;
  templateId: string;
  organizationId: string;
  propertyId: string;
  schema?: ExtractedLeaseSchema | null;
  reviewData?: LeaseReviewData | object | null;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function riskValue(value: unknown) {
  const risk = cleanText(value).toLowerCase();
  return risk === "low" || risk === "medium" || risk === "high" ? risk : null;
}

export async function syncLeaseTemplateClauses({
  tx,
  templateId,
  organizationId,
  propertyId,
  schema,
  reviewData,
}: SyncLeaseTemplateClausesInput) {
  const db = tx ?? (await import("@/lib/db")).prisma;
  const review = reviewData as LeaseReviewData | null | undefined;
  const reviewByTitle = new Map(
    (review?.clauseSummaries ?? [])
      .map((clause) => {
        const title = cleanText(clause.title);
        return title
          ? [
              title.toLowerCase(),
              {
                summary: cleanText(clause.summary) || null,
                riskLevel: riskValue(clause.riskLevel),
                explanation: cleanText(clause.explanation) || null,
              },
            ]
          : null;
      })
      .filter((entry): entry is [string, { summary: string | null; riskLevel: string | null; explanation: string | null }] => Boolean(entry)),
  );

  const schemaClauses = schema?.clauses ?? [];
  const clauses =
    schemaClauses.length > 0
      ? schemaClauses.map((clause, index) => {
          const title = cleanText(clause.title) || `Clause ${index + 1}`;
          const reviewMatch = reviewByTitle.get(title.toLowerCase());
          return {
            lease_template_id: templateId,
            organization_id: organizationId,
            property_id: propertyId,
            title,
            body: cleanText(clause.body) || null,
            summary: reviewMatch?.summary ?? null,
            risk_level: reviewMatch?.riskLevel ?? null,
            explanation: reviewMatch?.explanation ?? null,
            sort_order: index,
            source: reviewMatch ? "extracted_reviewed" : "extracted",
          };
        })
      : (review?.clauseSummaries ?? [])
          .map((clause, index) => {
            const title = cleanText(clause.title);
            return title
              ? {
                  lease_template_id: templateId,
                  organization_id: organizationId,
                  property_id: propertyId,
                  title,
                  body: null,
                  summary: cleanText(clause.summary) || null,
                  risk_level: riskValue(clause.riskLevel),
                  explanation: cleanText(clause.explanation) || null,
                  sort_order: index,
                  source: "review",
                }
              : null;
          })
          .filter((clause): clause is NonNullable<typeof clause> => Boolean(clause));

  await db.lease_template_clauses.deleteMany({
    where: { lease_template_id: templateId },
  });

  if (clauses.length > 0) {
    await db.lease_template_clauses.createMany({ data: clauses });
  }

  return clauses.length;
}
