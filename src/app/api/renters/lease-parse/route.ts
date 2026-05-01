import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";

const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/jpg"]);
const ALLOWED_RENDERED_IMAGE_MIME = new Set(["image/jpeg", "image/png"]);
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_RENDERED_PAGES = 5;

type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

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

const leaseTool: AnthropicTool = {
  name: "extract_lease_onboarding_details",
  description: "Extract structured renter onboarding details from a residential lease document.",
  input_schema: {
    type: "object",
    properties: {
      propertyAddress: {
        type: "string",
        description: "The full leased property address as written in the lease. Empty string if not found.",
      },
      unitNumber: {
        type: "string",
        description: "The leased unit/apartment number only. Empty string if not found.",
      },
      firstName: { type: "string", description: "Primary tenant first name. Empty string if not found." },
      lastName: { type: "string", description: "Primary tenant last name. Empty string if not found." },
      email: { type: "string", description: "Primary tenant email. Empty string if not found." },
      phone: { type: "string", description: "Primary tenant phone number. Empty string if not found." },
      startDate: { type: "string", description: "Lease start date in YYYY-MM-DD format. Empty string if not found." },
      endDate: { type: "string", description: "Lease end date in YYYY-MM-DD format. Empty string if month-to-month or not found." },
      rentAmount: { type: "number", description: "Monthly rent amount as a number. Use 0 if not found." },
      securityDeposit: { type: "number", description: "Security deposit amount as a number. Use 0 if not found." },
    },
    required: [
      "propertyAddress",
      "unitNumber",
      "firstName",
      "lastName",
      "email",
      "phone",
      "startDate",
      "endDate",
      "rentAmount",
      "securityDeposit",
    ],
  },
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
      tools: [leaseTool],
      tool_choice: { type: "tool", name: leaseTool.name },
      system:
        "You extract facts from residential lease documents for renter onboarding. " +
        "Only use values visibly present in the document. Do not guess. " +
        "If multiple tenants appear, extract the first or primary tenant. " +
        "Dates must be YYYY-MM-DD. Amounts must be numeric without currency symbols.",
      messages: [
        {
          role: "user",
          content: [
            ...documentBlocks,
            {
              type: "text",
              text:
                "Extract the lease details needed for renter onboarding. " +
                "Pay special attention to the leased property address and unit/apartment number.",
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
  return Response.json({
    propertyAddress: normalizeText(extracted.propertyAddress),
    unitNumber: normalizeText(extracted.unitNumber),
    firstName: normalizeText(extracted.firstName),
    lastName: normalizeText(extracted.lastName),
    email: normalizeText(extracted.email),
    phone: normalizeText(extracted.phone),
    startDate: normalizeDate(extracted.startDate),
    endDate: normalizeDate(extracted.endDate),
    rentAmount: normalizeAmount(extracted.rentAmount),
    securityDeposit: normalizeAmount(extracted.securityDeposit),
  });
}
