import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  buildLeaseOnboardingSystemPrompt,
  buildLeaseOnboardingUserPrompt,
  leaseOnboardingTool,
} from "@/lib/lease-extract-prompt";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";

const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/jpg"]);
const ALLOWED_RENDERED_IMAGE_MIME = new Set(["image/jpeg", "image/png"]);
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_RENDERED_PAGES = 5;

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

type AnthropicMessageResponse = {
  content: AnthropicContentBlock[];
};

type AnthropicErrorResponse = {
  error?: {
    message?: string;
  };
};

function normalizeDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAmount(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) && amount > 0 ? String(Math.round(amount * 100) / 100) : "";
}

export async function POST(request: NextRequest) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Lease parsing is not configured." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data." }, { status: 400 });
  }

  const propertyId = form.get("propertyId");
  const unitId = form.get("unitId");
  const leaseFile = form.get("leaseFile");
  const leasePageImages = form
    .getAll("leasePageImage")
    .filter((file): file is File => file instanceof File && file.size > 0)
    .slice(0, MAX_RENDERED_PAGES);

  if (typeof propertyId !== "string" || !propertyId.trim()) {
    return Response.json({ error: "propertyId is required." }, { status: 422 });
  }
  if (typeof unitId !== "string" || !unitId.trim()) {
    return Response.json({ error: "unitId is required." }, { status: 422 });
  }

  const permissionError = requirePropertyPermission(ctx, "invite_renters", propertyId.trim());
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const unit = await prisma.units.findFirst({
    where: {
      id: unitId.trim(),
      property_id: propertyId.trim(),
      deleted_at: null,
      properties: { organization_id: ctx.orgDbId, deleted_at: null },
    },
    select: { id: true },
  });
  if (!unit) {
    return Response.json({ error: "Unit not found." }, { status: 404 });
  }

  if (!(leaseFile instanceof File) && leasePageImages.length === 0) {
    return Response.json({ error: "Lease document is required." }, { status: 422 });
  }
  if (leaseFile instanceof File && (!ALLOWED_MIME.has(leaseFile.type) || leaseFile.size > MAX_BYTES)) {
    return Response.json({ error: "Upload a PDF, JPG, or PNG lease document under 20MB." }, { status: 422 });
  }
  if (
    leasePageImages.some(
      (image) => !ALLOWED_RENDERED_IMAGE_MIME.has(image.type) || image.size > MAX_BYTES,
    )
  ) {
    return Response.json({ error: "Rendered lease pages must be JPG or PNG images under 20MB each." }, { status: 422 });
  }

  const documentBlocks = await Promise.all(
    leasePageImages.length > 0
      ? leasePageImages.map(async (image) => ({
          type: "image",
          source: {
            type: "base64",
            media_type: image.type,
            data: Buffer.from(await image.arrayBuffer()).toString("base64"),
          },
        }))
      : [
          (async () => {
            const data = Buffer.from(await (leaseFile as File).arrayBuffer()).toString("base64");
            return (leaseFile as File).type === "application/pdf"
              ? {
                  type: "document",
                  source: {
                    type: "base64",
                    media_type: "application/pdf",
                    data,
                  },
                }
              : {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: (leaseFile as File).type === "image/jpg" ? "image/jpeg" : (leaseFile as File).type,
                    data,
                  },
                };
          })(),
        ],
  );

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      tools: [leaseOnboardingTool],
      tool_choice: { type: "tool", name: leaseOnboardingTool.name },
      system: buildLeaseOnboardingSystemPrompt(),
      messages: [
        {
          role: "user",
          content: [
            ...documentBlocks,
            {
              type: "text",
              text: buildLeaseOnboardingUserPrompt(),
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[lease-parse] Anthropic API error:", response.status, errText);
    let upstreamMessage = "";
    try {
      upstreamMessage = ((JSON.parse(errText) as AnthropicErrorResponse).error?.message ?? "").toLowerCase();
    } catch {
      upstreamMessage = errText.toLowerCase();
    }

    if (upstreamMessage.includes("password protected")) {
      return Response.json(
        { error: "This PDF is password protected. Upload an unlocked PDF or a clear image of the lease." },
        { status: 422 },
      );
    }

    if (upstreamMessage.includes("too many pages")) {
      return Response.json(
        { error: "This PDF is too long to parse. Upload the signed lease pages only." },
        { status: 422 },
      );
    }

    return Response.json({ error: "Could not parse this lease document." }, { status: 502 });
  }

  const message = (await response.json()) as AnthropicMessageResponse;
  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse) {
    return Response.json({ error: "Could not extract lease details from this document." }, { status: 422 });
  }

  const extracted = toolUse.input as Record<string, unknown>;
  const rawAdditional = Array.isArray(extracted.additionalTenants) ? extracted.additionalTenants : [];
  const additionalTenants = rawAdditional.map((t: Record<string, unknown>) => ({
    firstName: normalizeText(t.firstName),
    lastName: normalizeText(t.lastName),
    email: normalizeText(t.email),
    phone: normalizeText(t.phone),
  }));
  return Response.json({
    propertyAddress: normalizeText(extracted.propertyAddress),
    propertyAddressConfidence: normalizeText(extracted.propertyAddressConfidence),
    propertyAddressEvidence: normalizeText(extracted.propertyAddressEvidence),
    unitNumber: normalizeText(extracted.unitNumber),
    unitNumberConfidence: normalizeText(extracted.unitNumberConfidence),
    unitNumberEvidence: normalizeText(extracted.unitNumberEvidence),
    firstName: normalizeText(extracted.firstName),
    lastName: normalizeText(extracted.lastName),
    email: normalizeText(extracted.email),
    phone: normalizeText(extracted.phone),
    tenantEvidence: normalizeText(extracted.tenantEvidence),
    additionalTenants,
    startDate: normalizeDate(extracted.startDate),
    startDateConfidence: normalizeText(extracted.startDateConfidence),
    startDateEvidence: normalizeText(extracted.startDateEvidence),
    endDate: normalizeDate(extracted.endDate),
    endDateConfidence: normalizeText(extracted.endDateConfidence),
    endDateEvidence: normalizeText(extracted.endDateEvidence),
    rentAmount: normalizeAmount(extracted.rentAmount),
    rentAmountConfidence: normalizeText(extracted.rentAmountConfidence),
    rentAmountEvidence: normalizeText(extracted.rentAmountEvidence),
    securityDeposit: normalizeAmount(extracted.securityDeposit),
    securityDepositConfidence: normalizeText(extracted.securityDepositConfidence),
    securityDepositEvidence: normalizeText(extracted.securityDepositEvidence),
  });
}
