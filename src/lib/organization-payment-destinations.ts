import { getAccountingData } from "@/lib/accounting";
import { prisma } from "@/lib/db";
import {
  createPlaidOriginatorFundingAccount,
  decryptPlaidAccessToken,
} from "@/lib/plaid";

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
  accountType?: string | null;
  accountSubtype?: string | null;
}) {
  if (args.connectedAccountId.startsWith("item:")) {
    return false;
  }

  const structuredLabel = `${args.accountSubtype ?? ""} ${args.accountType ?? ""}`.toLowerCase();
  if (structuredLabel.trim()) {
    const isStructuredDepositAccount = /\b(checking|savings)\b/.test(structuredLabel);
    const isStructuredCardLike =
      /\b(credit|card|loan|line of credit)\b/.test(structuredLabel);

    return isStructuredDepositAccount && !isStructuredCardLike;
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
  if (!destination.plaid_account_id) {
    return `item:${destination.plaid_item_id}`;
  }

  return `${destination.plaid_item_id}:${destination.plaid_account_id}`;
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

export async function requireOrganizationRentCollectionFundingAccount(organizationId: string) {
  const destination = await requireOrganizationRentCollectionAccount(organizationId);

  if (!destination.plaidFundingAccountId) {
    throw new Error(
      "This organization has not finished configuring the bank account that should receive rent. Ask your property manager to reconnect the rent collection account so ACH payments can settle to the correct bank account.",
    );
  }

  return destination;
}

export async function setOrganizationRentCollectionAccount(args: {
  organizationId: string;
  clerkOrgId: string;
  connectedAccountId: string;
}) {
  const existingDestination = await getOrganizationRentCollectionAccount(args.organizationId);
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
      accountType: connectedAccount.accountType,
      accountSubtype: connectedAccount.accountSubtype,
    })
  ) {
    throw new Error(
      "Only connected checking or savings accounts can be used for rent collection.",
    );
  }

  const plaidAccountId = connectedAccount.id.startsWith("item:")
    ? null
    : connectedAccount.plaidAccountId;

  let resolvedFundingAccountId =
    existingDestination?.selectedConnectedAccountId === connectedAccount.id
      ? existingDestination.plaidFundingAccountId
      : null;

  if (!resolvedFundingAccountId) {
    if (!connectedAccount.plaidAccountId) {
      throw new Error("Choose a specific connected checking or savings account first.");
    }

    const originatorClientId =
      process.env.PLAID_TRANSFER_ORIGINATOR_CLIENT_ID ??
      process.env.PLAID_ORIGINATOR_CLIENT_ID ??
      null;

    if (!originatorClientId) {
      throw new Error(
        "Plaid Transfer funding-account setup is not enabled for this environment yet. Ask your Plaid account team to enable originator funding-account access, then try again.",
      );
    }

    const plaidItem = await prisma.plaid_items.findUnique({
      where: { id: connectedAccount.plaidItemId },
      select: { access_token: true },
    });

    if (!plaidItem?.access_token) {
      throw new Error("Reconnect this bank account before using it for rent collection.");
    }

    const fundingAccount = await createPlaidOriginatorFundingAccount({
      originatorClientId,
      accessToken: decryptPlaidAccessToken(plaidItem.access_token),
      accountId: connectedAccount.plaidAccountId,
      displayName: `${connectedAccount.name} - rent collection`,
    });

    if ("error" in fundingAccount) {
      if (fundingAccount.status === 401 || fundingAccount.status === 403) {
        throw new Error(
          "Plaid has not enabled originator funding-account access for this environment yet. Ask your Plaid account team to enable Transfer for Platforms or originator funding-account routes, then try again.",
        );
      }

      throw new Error(fundingAccount.error);
    }

    resolvedFundingAccountId = fundingAccount.fundingAccountId;
  }

  if (!resolvedFundingAccountId) {
    throw new Error(
      "Plaid could not finish connecting this receiving account for rent collection.",
    );
  }

  const destination = await prisma.organization_payment_destinations.upsert({
    where: { organization_id: args.organizationId },
    update: {
      plaid_item_id: connectedAccount.plaidItemId,
      plaid_account_id: plaidAccountId,
      destination_account_label: connectedAccount.name,
      bank_institution_name: connectedAccount.provider,
      is_active: true,
      plaid_funding_account_id: resolvedFundingAccountId,
      updated_at: new Date(),
    },
    create: {
      organization_id: args.organizationId,
      plaid_item_id: connectedAccount.plaidItemId,
      plaid_account_id: plaidAccountId,
      destination_account_label: connectedAccount.name,
      bank_institution_name: connectedAccount.provider,
      is_active: true,
      plaid_funding_account_id: resolvedFundingAccountId,
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
