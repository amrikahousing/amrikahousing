import { isAccessError, requireOrgAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cachePlaidInstitutionLogo } from "@/lib/institution-logos";
import {
  encryptPlaidAccessToken,
  exchangePlaidPublicToken,
  type PlaidLinkSuccessMetadata,
} from "@/lib/plaid";
import { syncPlaidItemsToDb } from "@/lib/accounting";

type ExchangeBody = {
  publicToken?: unknown;
  metadata?: PlaidLinkSuccessMetadata;
};

export async function POST(request: Request) {
  const access = await requireOrgAccess();
  if (isAccessError(access)) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  let body: ExchangeBody;
  try {
    body = (await request.json()) as ExchangeBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.publicToken !== "string" || !body.publicToken.trim()) {
    return Response.json({ error: "Missing Plaid public token." }, { status: 422 });
  }

  const exchange = await exchangePlaidPublicToken(body.publicToken);
  if ("error" in exchange) {
    return Response.json({ error: exchange.error }, { status: exchange.status });
  }

  const institution = body.metadata?.institution;
  let encryptedAccessToken: string;
  try {
    encryptedAccessToken = encryptPlaidAccessToken(exchange.accessToken);
  } catch {
    return Response.json(
      { error: "Plaid token encryption is not configured." },
      { status: 501 },
    );
  }

  const existingItem = await prisma.plaid_items.findUnique({
    where: { item_id: exchange.itemId },
    select: { organization_id: true },
  });
  if (existingItem && existingItem.organization_id !== access.orgDbId) {
    return Response.json(
      { error: "This bank account is already connected to another organization." },
      { status: 409 },
    );
  }

  const institutionCache = await cachePlaidInstitutionLogo(institution).catch(() => null);
  const institutionId = institutionCache ? institution?.institution_id ?? null : null;
  const institutionName = institutionCache?.name ?? institution?.name ?? null;

  const item = await prisma.plaid_items.upsert({
    where: { item_id: exchange.itemId },
    update: {
      access_token: encryptedAccessToken,
      institution_id: institutionId,
      institution_name: institutionName,
      status: "connected",
      sync_enabled: true,
      hidden_at: null,
      disconnected_at: null,
      updated_at: new Date(),
    },
    create: {
      organization_id: access.orgDbId,
      item_id: exchange.itemId,
      access_token: encryptedAccessToken,
      institution_id: institutionId,
      institution_name: institutionName,
      status: "connected",
      sync_enabled: true,
      created_by: access.userId,
    },
    select: {
      id: true,
      institution_name: true,
      status: true,
    },
  });

  await syncPlaidItemsToDb(access.orgId);

  return Response.json({
    item: {
      id: item.id,
      institutionName: item.institution_name,
      status: item.status,
    },
  });
}
