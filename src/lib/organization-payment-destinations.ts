import { getAccountingData } from "@/lib/accounting";
import { prisma } from "@/lib/db";

export type OrganizationRentCollectionAccount = {
  id: string;
  organizationId: string;
  plaidItemId: string;
  plaidAccountId: string | null;
  destinationAccountLabel: string;
  bankInstitutionName: string;
  isActive: boolean;
  plaidFundingAccountId: string | null;
  selectedConnectedAccountId: string;
  createdAt: Date;
  updatedAt: Date;
};

export function isEligibleRentCollectionAccount(args: {
  connectedAccountId: string;
  name: string;
  provider: string;
}) {
  if (args.connectedAccountId.startsWith("item:")) {
    return false;
  }

  const label = `${args.name} ${args.provider}`.toLowerCase();
  const isBankDepositAccount = /\b(checking|savings)\b/.test(label);
  const isCardLikeAccount =
    /\b(credit|card|loan|line of credit)\b/.test(label);

  return isBankDepositAccount && !isCardLikeAccount;
}

function toConnectedAccountId(destination: {
  plaid_account_id: string | null;
  plaid_item_id: string;
}) {
  return destination.plaid_account_id ?? `item:${destination.plaid_item_id}`;
}

function formatDestination(destination: {
  id: string;
  organization_id: string;
  plaid_item_id: string;
  plaid_account_id: string | null;
  destination_account_label: string;
  bank_institution_name: string;
  is_active: boolean;
  plaid_funding_account_id: string | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: destination.id,
    organizationId: destination.organization_id,
    plaidItemId: destination.plaid_item_id,
    plaidAccountId: destination.plaid_account_id,
    destinationAccountLabel: destination.destination_account_label,
    bankInstitutionName: destination.bank_institution_name,
    isActive: destination.is_active,
    plaidFundingAccountId: destination.plaid_funding_account_id,
    selectedConnectedAccountId: toConnectedAccountId(destination),
    createdAt: destination.created_at,
    updatedAt: destination.updated_at,
  } satisfies OrganizationRentCollectionAccount;
}

export async function getOrganizationRentCollectionAccount(organizationId: string) {
  const destination = await prisma.organization_payment_destinations.findUnique({
    where: { organization_id: organizationId },
    select: {
      id: true,
      organization_id: true,
      plaid_item_id: true,
      plaid_account_id: true,
      destination_account_label: true,
      bank_institution_name: true,
      is_active: true,
      plaid_funding_account_id: true,
      created_at: true,
      updated_at: true,
    },
  });

  return destination ? formatDestination(destination) : null;
}

export async function requireOrganizationRentCollectionAccount(organizationId: string) {
  const destination = await getOrganizationRentCollectionAccount(organizationId);
  if (!destination?.isActive) {
    throw new Error(
      "This organization has not configured its rent collection account yet. Ask your property manager to finish the setup in Accounts before accepting ACH rent payments.",
    );
  }

  return destination;
}

export async function setOrganizationRentCollectionAccount(args: {
  organizationId: string;
  clerkOrgId: string;
  connectedAccountId: string;
}) {
  const accountingData = await getAccountingData(args.clerkOrgId);
  const connectedAccount = accountingData.accountSummaries.find(
    (account) => account.id === args.connectedAccountId,
  );

  if (!connectedAccount?.plaidItemId) {
    throw new Error("Choose one of your organization's connected Plaid accounts first.");
  }

  if (
    !isEligibleRentCollectionAccount({
      connectedAccountId: connectedAccount.id,
      name: connectedAccount.name,
      provider: connectedAccount.provider,
    })
  ) {
    throw new Error(
      "Only connected checking or savings accounts can be used for rent collection.",
    );
  }

  const plaidAccountId = connectedAccount.id.startsWith("item:")
    ? null
    : connectedAccount.id;

  const destination = await prisma.organization_payment_destinations.upsert({
    where: { organization_id: args.organizationId },
    update: {
      plaid_item_id: connectedAccount.plaidItemId,
      plaid_account_id: plaidAccountId,
      destination_account_label: connectedAccount.name,
      bank_institution_name: connectedAccount.provider,
      is_active: true,
      updated_at: new Date(),
    },
    create: {
      organization_id: args.organizationId,
      plaid_item_id: connectedAccount.plaidItemId,
      plaid_account_id: plaidAccountId,
      destination_account_label: connectedAccount.name,
      bank_institution_name: connectedAccount.provider,
      is_active: true,
    },
    select: {
      id: true,
      organization_id: true,
      plaid_item_id: true,
      plaid_account_id: true,
      destination_account_label: true,
      bank_institution_name: true,
      is_active: true,
      plaid_funding_account_id: true,
      created_at: true,
      updated_at: true,
    },
  });

  return formatDestination(destination);
}

export async function clearOrganizationRentCollectionAccount(organizationId: string) {
  await prisma.organization_payment_destinations.deleteMany({
    where: { organization_id: organizationId },
  });
}
