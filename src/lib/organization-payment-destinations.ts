import { getAccountingData } from "@/lib/accounting";
import { prisma } from "@/lib/db";
import { getStripeServer } from "@/lib/stripe";

const STRIPE_CONNECT_NOT_ENABLED_MESSAGE =
  "Stripe Connect is not enabled for this Stripe account yet. Enable Connect in Stripe, then try turning on rent collection again.";
const PLAID_STRIPE_ACCOUNT_MISMATCH_MESSAGE =
  "Plaid created a Stripe bank token, but this Stripe account cannot use it. Link this Plaid app to the same Stripe account and mode used by STRIPE_SECRET_KEY, then try again.";

export type OrganizationRentCollectionAccount = {
  id: string;
  organizationId: string;
  plaidItemId: string;
  plaidAccountId: string | null;
  destinationAccountLabel: string;
  bankInstitutionName: string;
  isActive: boolean;
  stripeExternalAccountId: string | null;
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
  stripe_external_account_id: string | null;
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
    stripeExternalAccountId: destination.stripe_external_account_id,
    selectedConnectedAccountId: toConnectedAccountId(destination),
    createdAt: destination.created_at,
    updatedAt: destination.updated_at,
  } satisfies OrganizationRentCollectionAccount;
}

function isStripeConnectNotEnabledError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("signed up for connect") ||
    message.includes("dashboard.stripe.com/connect")
  );
}

function isStripeBankTokenMismatchError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const stripeError = error as Error & { code?: string; param?: string };
  return (
    stripeError.code === "resource_missing" &&
    stripeError.param === "external_account" &&
    error.message.toLowerCase().includes("no such token")
  );
}

function normalizeStripeRentCollectionError(error: unknown, fallbackMessage: string) {
  if (isStripeConnectNotEnabledError(error)) {
    return new Error(STRIPE_CONNECT_NOT_ENABLED_MESSAGE, { cause: error });
  }

  if (isStripeBankTokenMismatchError(error)) {
    return new Error(PLAID_STRIPE_ACCOUNT_MISMATCH_MESSAGE, { cause: error });
  }

  if (error instanceof Error) {
    return new Error(fallbackMessage, { cause: error });
  }

  return new Error(fallbackMessage);
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
      stripe_external_account_id: true,
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

export async function requireOrganizationStripeRentDestination(organizationId: string) {
  const destination = await requireOrganizationRentCollectionAccount(organizationId);
  const organization = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: {
      stripe_account_id: true,
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
    },
  });

  if (!organization?.stripe_account_id) {
    throw new Error(
      "This organization has not finished connecting its rent receiving account for online payments.",
    );
  }

  if (!organization.stripe_charges_enabled || !organization.stripe_payouts_enabled) {
    throw new Error(
      "This organization must finish Stripe onboarding before accepting online rent payments.",
    );
  }

  return {
    ...destination,
    stripeAccountId: organization.stripe_account_id,
    stripeChargesEnabled: organization.stripe_charges_enabled,
    stripePayoutsEnabled: organization.stripe_payouts_enabled,
  };
}

async function ensureOrganizationStripeConnectedAccount(args: {
  organizationId: string;
  name: string;
  email?: string | null;
}) {
  const organization = await prisma.organizations.findUnique({
    where: { id: args.organizationId },
    select: {
      stripe_account_id: true,
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
    },
  });

  if (organization?.stripe_account_id) {
    return {
      stripeAccountId: organization.stripe_account_id,
      chargesEnabled: organization.stripe_charges_enabled,
      payoutsEnabled: organization.stripe_payouts_enabled,
    };
  }

  const stripe = getStripeServer();
  const account = await stripe.accounts
    .create({
      type: "express",
      country: "US",
      email: args.email ?? undefined,
      business_profile: {
        name: args.name,
        product_description: "Rental housing rent collection",
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: {
        organizationId: args.organizationId,
      },
    })
    .catch((error: unknown) => {
      throw normalizeStripeRentCollectionError(
        error,
        "Stripe could not create the rent collection account. Check your Stripe Connect setup and try again.",
      );
    });

  await prisma.organizations.update({
    where: { id: args.organizationId },
    data: {
      stripe_account_id: account.id,
      stripe_charges_enabled: account.charges_enabled ?? false,
      stripe_payouts_enabled: account.payouts_enabled ?? false,
      updated_at: new Date(),
    },
  });

  return {
    stripeAccountId: account.id,
    chargesEnabled: account.charges_enabled ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
  };
}

export async function setOrganizationRentCollectionAccount(args: {
  organizationId: string;
  clerkOrgId: string;
  connectedAccountId: string;
}) {
  const existingDestination = await getOrganizationRentCollectionAccount(args.organizationId);
  const organization = await prisma.organizations.findUnique({
    where: { id: args.organizationId },
    select: {
      id: true,
      name: true,
      email: true,
      stripe_account_id: true,
    },
  });
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

  if (!connectedAccount.plaidAccountId) {
    throw new Error("Choose a specific connected checking or savings account first.");
  }

  if (!organization) {
    throw new Error("Organization record not found.");
  }

  const connectedStripeAccount = await ensureOrganizationStripeConnectedAccount({
    organizationId: args.organizationId,
    name: organization.name,
    email: organization.email,
  });
  const resolvedStripeExternalAccountId =
    existingDestination?.selectedConnectedAccountId === connectedAccount.id
      ? existingDestination.stripeExternalAccountId
      : null;

  const destination = await prisma.organization_payment_destinations.upsert({
    where: { organization_id: args.organizationId },
    update: {
      plaid_item_id: connectedAccount.plaidItemId,
      plaid_account_id: plaidAccountId,
      destination_account_label: connectedAccount.name,
      bank_institution_name: connectedAccount.provider,
      is_active: true,
      stripe_external_account_id: resolvedStripeExternalAccountId,
      updated_at: new Date(),
    },
    create: {
      organization_id: args.organizationId,
      plaid_item_id: connectedAccount.plaidItemId,
      plaid_account_id: plaidAccountId,
      destination_account_label: connectedAccount.name,
      bank_institution_name: connectedAccount.provider,
      is_active: true,
      stripe_external_account_id: resolvedStripeExternalAccountId,
    },
    select: {
      id: true,
      organization_id: true,
      plaid_item_id: true,
      plaid_account_id: true,
      destination_account_label: true,
      bank_institution_name: true,
      is_active: true,
      stripe_external_account_id: true,
      created_at: true,
      updated_at: true,
    },
  });

  const needsOnboarding =
    !connectedStripeAccount.chargesEnabled || !connectedStripeAccount.payoutsEnabled;

  return { ...formatDestination(destination), needsOnboarding };
}

export async function createStripeOnboardingLink(
  organizationId: string,
  baseUrl: string,
) {
  const organization = await prisma.organizations.findUnique({
    where: { id: organizationId },
    select: { stripe_account_id: true },
  });

  if (!organization?.stripe_account_id) {
    throw new Error("No Stripe account found. Set up a rent collection account first.");
  }

  const accountsUrl = `${baseUrl}/accounts`;
  const stripe = getStripeServer();
  const accountLink = await stripe.accountLinks.create({
    account: organization.stripe_account_id,
    refresh_url: `${accountsUrl}?stripe_onboarding=refresh`,
    return_url: `${accountsUrl}?stripe_onboarding=complete`,
    type: "account_onboarding",
  });

  return { url: accountLink.url };
}

export async function clearOrganizationRentCollectionAccount(organizationId: string) {
  await prisma.organization_payment_destinations.deleteMany({
    where: { organization_id: organizationId },
  });
}
