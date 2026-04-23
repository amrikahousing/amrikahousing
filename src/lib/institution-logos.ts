import { prisma } from "@/lib/db";
import { getPlaidInstitution, type PlaidLinkSuccessMetadata } from "@/lib/plaid";

type InstitutionMetadata = NonNullable<PlaidLinkSuccessMetadata["institution"]>;

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanLogoUrl(value: unknown) {
  const logoUrl = cleanString(value);
  if (!logoUrl) return null;
  if (logoUrl.startsWith("data:")) return logoUrl;

  try {
    const url = new URL(logoUrl);
    return url.protocol === "https:" ? logoUrl : null;
  } catch {
    return null;
  }
}

export async function cachePlaidInstitutionLogo(metadata: InstitutionMetadata | null | undefined) {
  const institutionId = cleanString(metadata?.institution_id);
  if (!institutionId) return null;

  const existing = await prisma.plaid_institutions.findUnique({
    where: { institution_id: institutionId },
    select: { logo_url: true, name: true },
  });
  const metadataName = cleanString(metadata?.name);

  let name = metadataName ?? existing?.name ?? institutionId;
  let logoUrl = cleanLogoUrl(metadata?.logo) ?? existing?.logo_url ?? null;

  if (!logoUrl || !metadataName) {
    const plaidInstitution = await getPlaidInstitution({ institutionId });
    if (!("error" in plaidInstitution) && plaidInstitution.institution) {
      name = cleanString(plaidInstitution.institution.name) ?? name;
      logoUrl = cleanLogoUrl(plaidInstitution.institution.logo) ?? logoUrl;
    }
  }

  await prisma.plaid_institutions.upsert({
    where: { institution_id: institutionId },
    update: {
      name,
      logo_url: logoUrl,
      source: "plaid",
      last_fetched_at: new Date(),
      updated_at: new Date(),
    },
    create: {
      institution_id: institutionId,
      name,
      logo_url: logoUrl,
      source: "plaid",
      last_fetched_at: new Date(),
    },
  });

  return { logoUrl, name };
}
