import type Stripe from "stripe";
import type { TenantContext } from "@/lib/renter-auth";
import { prisma } from "@/lib/db";
import {
  createPlaidTransfer,
  createPlaidTransferAuthorization,
  createPlaidTransferLinkToken,
  decryptPlaidAccessToken,
  encryptPlaidAccessToken,
  exchangePlaidPublicToken,
  getPlaidTransferCapabilities,
  syncPlaidTransferEvents,
  type PlaidLinkSuccessMetadata,
} from "@/lib/plaid";
import { requireOrganizationRentCollectionFundingAccount } from "@/lib/organization-payment-destinations";
import { getStripeServer } from "@/lib/stripe";

const IN_FLIGHT_PLAID_ATTEMPT_STATUSES = [
  "authorized",
  "pending",
  "posted",
] as const;

export type SavedPaymentMethodSummary = {
  id: string;
  paymentProvider: "stripe" | "plaid";
  stripePaymentMethodId: string | null;
  paymentType: "card" | "us_bank_account";
  brand: string | null;
  bankName: string | null;
  bankAccountType: string | null;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  billingName: string | null;
  plaidLinkSessionId: string | null;
  isDefault: boolean;
  isActive: boolean;
};

export async function getTenantPaymentProfile(ctx: TenantContext) {
  const tenant = await prisma.tenants.findUnique({
    where: { id: ctx.tenantId },
    select: {
      id: true,
      email: true,
      first_name: true,
      last_name: true,
      organization_id: true,
      renter_payment_settings: {
        select: {
          id: true,
          stripe_customer_id: true,
          autopay_enabled: true,
          default_payment_method_id: true,
        },
      },
      renter_payment_methods: {
        where: {
          deleted_at: null,
          is_active: true,
        },
        orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
        select: {
          id: true,
          payment_provider: true,
          stripe_payment_method_id: true,
          plaid_link_session_id: true,
          payment_type: true,
          brand: true,
          bank_name: true,
          bank_account_type: true,
          last4: true,
          exp_month: true,
          exp_year: true,
          billing_name: true,
          is_default: true,
          is_active: true,
        },
      },
    },
  });

  return tenant
    ? {
        ...tenant,
        paymentMethods: tenant.renter_payment_methods.map((method) => ({
          id: method.id,
          paymentProvider: method.payment_provider === "plaid" ? "plaid" : "stripe",
          stripePaymentMethodId: method.stripe_payment_method_id,
          plaidLinkSessionId: method.plaid_link_session_id,
          paymentType: method.payment_type === "us_bank_account" ? "us_bank_account" : "card",
          brand: method.brand,
          bankName: method.bank_name,
          bankAccountType: method.bank_account_type,
          last4: method.last4,
          expMonth: method.exp_month,
          expYear: method.exp_year,
          billingName: method.billing_name,
          isDefault: method.is_default,
          isActive: method.is_active,
        })),
      }
    : null;
}

export async function ensureStripeCustomerForTenant(ctx: TenantContext) {
  const tenant = await prisma.tenants.findUnique({
    where: { id: ctx.tenantId },
    select: {
      id: true,
      email: true,
      first_name: true,
      last_name: true,
      organization_id: true,
      renter_payment_settings: {
        select: {
          id: true,
          stripe_customer_id: true,
        },
      },
    },
  });

  if (!tenant) {
    throw new Error("Tenant record not found.");
  }

  if (tenant.renter_payment_settings?.stripe_customer_id) {
    return {
      tenant,
      stripeCustomerId: tenant.renter_payment_settings.stripe_customer_id,
    };
  }

  const stripe = getStripeServer();
  const customer = await stripe.customers.create({
    email: tenant.email,
    name: [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || undefined,
    metadata: {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      sharedUserId: ctx.sharedUserId ?? "",
    },
  });

  await prisma.renter_payment_settings.upsert({
    where: { tenant_id: ctx.tenantId },
    update: {
      stripe_customer_id: customer.id,
      user_id: ctx.sharedUserId,
      organization_id: ctx.organizationId,
      updated_at: new Date(),
    },
    create: {
      tenant_id: ctx.tenantId,
      user_id: ctx.sharedUserId,
      organization_id: ctx.organizationId,
      stripe_customer_id: customer.id,
    },
  });

  return {
    tenant,
    stripeCustomerId: customer.id,
  };
}

export async function syncPaymentMethodFromStripe(
  ctx: Pick<TenantContext, "tenantId" | "organizationId" | "sharedUserId">,
  stripePaymentMethodId: string,
  stripeCustomerId: string,
) {
  const stripe = getStripeServer();
  const paymentMethod = await stripe.paymentMethods.retrieve(stripePaymentMethodId);

  if (
    (paymentMethod.type !== "card" || !paymentMethod.card) &&
    (paymentMethod.type !== "us_bank_account" || !paymentMethod.us_bank_account)
  ) {
    throw new Error("Stripe payment method is unavailable.");
  }

  const paymentType = paymentMethod.type === "us_bank_account" ? "us_bank_account" : "card";
  const cardDetails = paymentMethod.type === "card" ? paymentMethod.card : null;
  const bankDetails = paymentMethod.type === "us_bank_account" ? paymentMethod.us_bank_account : null;
  const methodLast4 = cardDetails?.last4 ?? bankDetails?.last4;

  if (!methodLast4) {
    throw new Error("Stripe payment method is missing display metadata.");
  }

  const existingDefault = await prisma.renter_payment_settings.findUnique({
    where: { tenant_id: ctx.tenantId },
    select: {
      default_payment_method_id: true,
    },
  });

  const savedMethod = await prisma.renter_payment_methods.upsert({
    where: { stripe_payment_method_id: paymentMethod.id },
    update: {
      payment_provider: "stripe",
      user_id: ctx.sharedUserId,
      organization_id: ctx.organizationId,
      stripe_customer_id: stripeCustomerId,
      payment_type: paymentType,
      brand: cardDetails?.brand ?? null,
      bank_name: bankDetails?.bank_name ?? null,
      bank_account_type: bankDetails?.account_type ?? null,
      last4: methodLast4,
      exp_month: cardDetails?.exp_month ?? null,
      exp_year: cardDetails?.exp_year ?? null,
      billing_name: paymentMethod.billing_details.name ?? null,
      is_active: true,
      deleted_at: null,
      updated_at: new Date(),
    },
    create: {
      tenant_id: ctx.tenantId,
      user_id: ctx.sharedUserId,
      organization_id: ctx.organizationId,
      payment_provider: "stripe",
      stripe_customer_id: stripeCustomerId,
      stripe_payment_method_id: paymentMethod.id,
      payment_type: paymentType,
      brand: cardDetails?.brand ?? null,
      bank_name: bankDetails?.bank_name ?? null,
      bank_account_type: bankDetails?.account_type ?? null,
      last4: methodLast4,
      exp_month: cardDetails?.exp_month ?? null,
      exp_year: cardDetails?.exp_year ?? null,
      billing_name: paymentMethod.billing_details.name ?? null,
      is_default: !existingDefault?.default_payment_method_id,
    },
    select: {
      id: true,
      payment_provider: true,
      stripe_payment_method_id: true,
      payment_type: true,
      brand: true,
      bank_name: true,
      bank_account_type: true,
      last4: true,
      exp_month: true,
      exp_year: true,
      billing_name: true,
      is_default: true,
      is_active: true,
    },
  });

  const shouldBeDefault = existingDefault?.default_payment_method_id
    ? existingDefault.default_payment_method_id === savedMethod.id
    : true;

  await prisma.$transaction(async (tx) => {
    if (shouldBeDefault) {
      await tx.renter_payment_methods.updateMany({
        where: {
          tenant_id: ctx.tenantId,
          deleted_at: null,
        },
        data: {
          is_default: false,
          updated_at: new Date(),
        },
      });

      await tx.renter_payment_methods.update({
        where: { id: savedMethod.id },
        data: {
          is_default: true,
          updated_at: new Date(),
        },
      });
    }

    await tx.renter_payment_settings.upsert({
      where: { tenant_id: ctx.tenantId },
      update: {
        user_id: ctx.sharedUserId,
        organization_id: ctx.organizationId,
        stripe_customer_id: stripeCustomerId,
        default_payment_method_id: shouldBeDefault ? savedMethod.id : existingDefault?.default_payment_method_id,
        updated_at: new Date(),
      },
      create: {
        tenant_id: ctx.tenantId,
        user_id: ctx.sharedUserId,
        organization_id: ctx.organizationId,
        stripe_customer_id: stripeCustomerId,
        default_payment_method_id: savedMethod.id,
      },
    });
  });
}

export async function setDefaultPaymentMethodForTenant(ctx: TenantContext, methodId: string) {
  const method = await prisma.renter_payment_methods.findFirst({
    where: {
      id: methodId,
      tenant_id: ctx.tenantId,
      is_active: true,
      deleted_at: null,
    },
    select: {
      id: true,
      payment_provider: true,
      payment_type: true,
    },
  });

  if (!method) {
    throw new Error("Payment method not found.");
  }

  if (method.payment_provider !== "plaid" || method.payment_type !== "us_bank_account") {
    throw new Error(
      "Only ACH bank accounts can be used for rent collection. Link a bank account to receive rent in the organization's bank account.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.renter_payment_methods.updateMany({
      where: {
        tenant_id: ctx.tenantId,
        deleted_at: null,
      },
      data: {
        is_default: false,
        updated_at: new Date(),
      },
    });

    await tx.renter_payment_methods.update({
      where: { id: method.id },
      data: {
        is_default: true,
        updated_at: new Date(),
      },
    });

    await tx.renter_payment_settings.upsert({
      where: { tenant_id: ctx.tenantId },
      update: {
        user_id: ctx.sharedUserId,
        organization_id: ctx.organizationId,
        default_payment_method_id: method.id,
        autopay_enabled:
          method.payment_provider === "stripe" && method.payment_type === "card"
            ? undefined
            : false,
        updated_at: new Date(),
      },
      create: {
        tenant_id: ctx.tenantId,
        user_id: ctx.sharedUserId,
        organization_id: ctx.organizationId,
        default_payment_method_id: method.id,
        autopay_enabled: false,
      },
    });
  });
}

export async function removePaymentMethodForTenant(ctx: TenantContext, methodId: string) {
  const method = await prisma.renter_payment_methods.findFirst({
    where: {
      id: methodId,
      tenant_id: ctx.tenantId,
      is_active: true,
      deleted_at: null,
    },
    select: {
      id: true,
      payment_provider: true,
      stripe_payment_method_id: true,
      payment_type: true,
      is_default: true,
    },
  });

  if (!method) {
    throw new Error("Payment method not found.");
  }

  if (method.payment_provider === "stripe" && method.stripe_payment_method_id) {
    const stripe = getStripeServer();
    await stripe.paymentMethods.detach(method.stripe_payment_method_id);
  }

  const fallbackMethod = await prisma.renter_payment_methods.findFirst({
    where: {
      tenant_id: ctx.tenantId,
      is_active: true,
      deleted_at: null,
      id: { not: method.id },
    },
    orderBy: { created_at: "desc" },
    select: { id: true, payment_provider: true, payment_type: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.renter_payment_methods.update({
      where: { id: method.id },
      data: {
        is_active: false,
        is_default: false,
        deleted_at: new Date(),
        updated_at: new Date(),
      },
    });

    if (fallbackMethod) {
      await tx.renter_payment_methods.update({
        where: { id: fallbackMethod.id },
        data: {
          is_default: true,
          updated_at: new Date(),
        },
      });
    }

    await tx.renter_payment_settings.upsert({
      where: { tenant_id: ctx.tenantId },
      update: {
        user_id: ctx.sharedUserId,
        organization_id: ctx.organizationId,
        default_payment_method_id: fallbackMethod?.id ?? null,
        autopay_enabled:
          fallbackMethod &&
          fallbackMethod.payment_provider === "stripe" &&
          fallbackMethod.payment_type === "card"
            ? undefined
            : false,
        updated_at: new Date(),
      },
      create: {
        tenant_id: ctx.tenantId,
        user_id: ctx.sharedUserId,
        organization_id: ctx.organizationId,
        default_payment_method_id: fallbackMethod?.id ?? null,
        autopay_enabled: false,
      },
    });
  });
}

export async function setAutopayEnabledForTenant(ctx: TenantContext, enabled: boolean) {
  const defaultMethod = await prisma.renter_payment_methods.findFirst({
    where: {
      tenant_id: ctx.tenantId,
      is_default: true,
      is_active: true,
      deleted_at: null,
    },
    select: { id: true },
  });

  if (enabled) {
    throw new Error(
      "Auto-pay is unavailable right now. Rent payments must be submitted as ACH so funds land in the organization's receiving bank account.",
    );
  }

  await prisma.renter_payment_settings.upsert({
    where: { tenant_id: ctx.tenantId },
    update: {
      user_id: ctx.sharedUserId,
      organization_id: ctx.organizationId,
      default_payment_method_id: defaultMethod?.id ?? null,
      autopay_enabled: enabled,
      updated_at: new Date(),
    },
    create: {
      tenant_id: ctx.tenantId,
      user_id: ctx.sharedUserId,
      organization_id: ctx.organizationId,
      default_payment_method_id: defaultMethod?.id ?? null,
      autopay_enabled: enabled,
    },
  });
}

export async function createPaymentAttempt(
  ctx: TenantContext,
  args: {
    paymentId: string;
    renterPaymentMethodId: string;
    amount: string;
  },
) {
  const payment = await prisma.payments.findFirst({
    where: {
      id: args.paymentId,
      tenant_id: ctx.tenantId,
      status: "pending",
    },
    select: {
      id: true,
      amount: true,
      currency: true,
      type: true,
      due_date: true,
    },
  });

  if (!payment) {
    throw new Error("Payment charge not found.");
  }

  const method = await prisma.renter_payment_methods.findFirst({
    where: {
      id: args.renterPaymentMethodId,
      tenant_id: ctx.tenantId,
      is_active: true,
      deleted_at: null,
    },
    select: {
      id: true,
      payment_provider: true,
      stripe_customer_id: true,
      stripe_payment_method_id: true,
    },
  });

  if (!method) {
    throw new Error("Saved payment method not found.");
  }

  if (
    method.payment_provider !== "stripe" ||
    !method.stripe_customer_id ||
    !method.stripe_payment_method_id
  ) {
    throw new Error("Use the Plaid ACH flow for this payment method.");
  }

  throw new Error(
    "Card payments are unavailable for rent collection. Pay with a linked bank account so funds settle to the organization's receiving account.",
  );
}

export async function createPlaidLinkTokenForTenant(ctx: TenantContext) {
  const result = await createPlaidTransferLinkToken({
    userId: ctx.userId,
    clientName: "Amrika Housing",
  });

  if ("error" in result) {
    throw new Error(result.error);
  }

  return result;
}

export async function savePlaidBankAccountForTenant(
  ctx: TenantContext,
  args: {
    publicToken: string;
    metadata: PlaidLinkSuccessMetadata | null;
  },
) {
  const exchange = await exchangePlaidPublicToken(args.publicToken);
  if ("error" in exchange) {
    throw new Error(exchange.error);
  }

  const selectedAccount = args.metadata?.accounts?.[0];
  const accountId = selectedAccount?.id?.trim();
  const accountMask = selectedAccount?.mask?.trim();

  if (!accountId || !accountMask) {
    throw new Error("Plaid did not return a bank account that can be saved.");
  }

  const capabilities = await getPlaidTransferCapabilities({
    accessToken: exchange.accessToken,
    accountId,
  });
  if ("error" in capabilities) {
    throw new Error(capabilities.error);
  }

  const existingDefault = await prisma.renter_payment_settings.findUnique({
    where: { tenant_id: ctx.tenantId },
    select: {
      default_payment_method_id: true,
    },
  });

  const encryptedAccessToken = encryptPlaidAccessToken(exchange.accessToken);
  const paymentMethod = await prisma.renter_payment_methods.create({
    data: {
      tenant_id: ctx.tenantId,
      user_id: ctx.sharedUserId,
      organization_id: ctx.organizationId,
      payment_provider: "plaid",
      payment_type: "us_bank_account",
      plaid_access_token: encryptedAccessToken,
      plaid_item_id: exchange.itemId,
      plaid_account_id: accountId,
      plaid_institution_id: args.metadata?.institution?.institution_id ?? null,
      plaid_link_session_id: args.metadata?.link_session_id ?? null,
      plaid_transfer_eligible: capabilities.institutionSupported,
      bank_name: args.metadata?.institution?.name ?? "Bank account",
      bank_account_type: selectedAccount?.subtype ?? selectedAccount?.type ?? null,
      last4: accountMask,
      billing_name: null,
      is_default: !existingDefault?.default_payment_method_id,
    },
    select: {
      id: true,
      bank_name: true,
      last4: true,
      plaid_transfer_eligible: true,
      is_default: true,
    },
  });

  if (paymentMethod.is_default) {
    await prisma.renter_payment_settings.upsert({
      where: { tenant_id: ctx.tenantId },
      update: {
        user_id: ctx.sharedUserId,
        organization_id: ctx.organizationId,
        default_payment_method_id: paymentMethod.id,
        updated_at: new Date(),
      },
      create: {
        tenant_id: ctx.tenantId,
        user_id: ctx.sharedUserId,
        organization_id: ctx.organizationId,
        default_payment_method_id: paymentMethod.id,
      },
    });
  }

  return paymentMethod;
}

async function getPlaidTransferContext(
  ctx: TenantContext,
  args: {
    paymentId: string;
    renterPaymentMethodId: string;
    amount: string;
  },
) {
  const payment = await prisma.payments.findFirst({
    where: {
      id: args.paymentId,
      tenant_id: ctx.tenantId,
      status: "pending",
    },
    select: {
      id: true,
      amount: true,
      currency: true,
      type: true,
      due_date: true,
      tenants: {
        select: {
          first_name: true,
          last_name: true,
          email: true,
        },
      },
    },
  });

  if (!payment) {
    throw new Error("Payment charge not found.");
  }

  const method = await prisma.renter_payment_methods.findFirst({
    where: {
      id: args.renterPaymentMethodId,
      tenant_id: ctx.tenantId,
      is_active: true,
      deleted_at: null,
      payment_provider: "plaid",
      payment_type: "us_bank_account",
    },
    select: {
      id: true,
      plaid_access_token: true,
      plaid_account_id: true,
      plaid_transfer_eligible: true,
      bank_name: true,
      last4: true,
    },
  });

  if (!method || !method.plaid_access_token || !method.plaid_account_id) {
    throw new Error("Saved Plaid bank account not found.");
  }

  if (!method.plaid_transfer_eligible) {
    throw new Error("This bank account is not eligible for ACH rent payments.");
  }

  const normalizedAmount = payment.amount.toFixed(2);
  if (normalizedAmount !== args.amount) {
    throw new Error("Payment amount does not match the current charge.");
  }

  const rentCollectionAccount = await requireOrganizationRentCollectionFundingAccount(
    ctx.organizationId,
  );

  return {
    payment,
    method: {
      ...method,
      plaid_access_token: method.plaid_access_token,
      plaid_account_id: method.plaid_account_id,
    },
    rentCollectionAccount,
  };
}

function getPlaidConsentText(amount: string) {
  return `I authorize Amrika Housing to debit my bank account one time for $${amount} via ACH for rent and related housing charges.`;
}

export async function authorizePlaidPaymentAttempt(
  ctx: TenantContext,
  args: {
    paymentId: string;
    renterPaymentMethodId: string;
    amount: string;
    ipAddress: string | null;
    userAgent: string | null;
  },
) {
  const { payment, method, rentCollectionAccount } = await getPlaidTransferContext(ctx, args);
  const existingAttempt = await prisma.payment_attempts.findFirst({
    where: {
      payment_id: payment.id,
      tenant_id: ctx.tenantId,
      renter_payment_method_id: method.id,
      payment_provider: "plaid",
      status: {
        in: [...IN_FLIGHT_PLAID_ATTEMPT_STATUSES],
      },
    },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      plaid_authorization_id: true,
      plaid_transfer_id: true,
      status: true,
    },
  });

  if (existingAttempt) {
    return existingAttempt;
  }

  const idempotencyKey = `${payment.id}:${method.id}:plaid`;
  const legalName = [payment.tenants?.first_name, payment.tenants?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!legalName) {
    throw new Error("The tenant record is missing the legal name required for ACH authorization.");
  }

  const authorization = await createPlaidTransferAuthorization({
    accessToken: decryptPlaidAccessToken(method.plaid_access_token),
    accountId: method.plaid_account_id,
    legalName,
    amount: args.amount,
    idempotencyKey,
    emailAddress: payment.tenants?.email ?? null,
    fundingAccountId: rentCollectionAccount.plaidFundingAccountId,
  });

  if ("error" in authorization) {
    throw new Error(authorization.error);
  }

  const attempt = await prisma.payment_attempts.create({
    data: {
      payment_id: payment.id,
      tenant_id: ctx.tenantId,
      user_id: ctx.sharedUserId,
      organization_id: ctx.organizationId,
      renter_payment_method_id: method.id,
      payment_provider: "plaid",
      plaid_authorization_id: authorization.authorizationId,
      idempotency_key: idempotencyKey,
      amount: payment.amount,
      currency: payment.currency,
      status: authorization.decision === "approved" ? "authorized" : "failed",
      failure_code: authorization.decisionRationale?.code ?? null,
      failure_message:
        authorization.decision === "approved"
          ? null
          : authorization.decisionRationale?.description ?? "ACH authorization was declined.",
      consent_text: getPlaidConsentText(args.amount),
      consent_accepted_at: new Date(),
      consent_ip_address: args.ipAddress,
      consent_user_agent: args.userAgent,
    },
    select: {
      id: true,
      plaid_authorization_id: true,
      plaid_transfer_id: true,
      status: true,
      failure_code: true,
      failure_message: true,
    },
  });

  return attempt;
}

export async function createPlaidTransferForAttempt(
  ctx: TenantContext,
  args: {
    paymentId: string;
    renterPaymentMethodId: string;
    amount: string;
  },
) {
  const { payment, method, rentCollectionAccount } = await getPlaidTransferContext(ctx, args);
  const attempt = await prisma.payment_attempts.findFirst({
    where: {
      payment_id: payment.id,
      tenant_id: ctx.tenantId,
      renter_payment_method_id: method.id,
      payment_provider: "plaid",
    },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      plaid_authorization_id: true,
      plaid_transfer_id: true,
      status: true,
    },
  });

  if (!attempt?.plaid_authorization_id) {
    throw new Error("Authorize the ACH debit before creating the transfer.");
  }

  if (attempt.plaid_transfer_id) {
    return attempt;
  }

  if (attempt.status === "failed") {
    throw new Error("The ACH authorization was declined.");
  }

  const transfer = await createPlaidTransfer({
    authorizationId: attempt.plaid_authorization_id,
    accessToken: decryptPlaidAccessToken(method.plaid_access_token),
    accountId: method.plaid_account_id,
    amount: args.amount,
    description: "RENT",
    fundingAccountId: rentCollectionAccount.plaidFundingAccountId,
    metadata: {
      paymentId: payment.id,
      renterPaymentMethodId: method.id,
      tenantId: ctx.tenantId,
      organizationRentCollectionItemId: rentCollectionAccount.plaidItemId,
      organizationRentCollectionAccountId: rentCollectionAccount.plaidAccountId ?? "",
    },
  });

  if ("error" in transfer) {
    throw new Error(transfer.error);
  }

  return prisma.payment_attempts.update({
    where: { id: attempt.id },
    data: {
      plaid_transfer_id: transfer.transferId,
      status: transfer.status,
      updated_at: new Date(),
    },
    select: {
      id: true,
      plaid_authorization_id: true,
      plaid_transfer_id: true,
      status: true,
    },
  });
}

export async function handlePlaidTransferWebhookEvent(payload: {
  webhook_type?: string;
  webhook_code?: string;
}) {
  if (
    payload.webhook_type !== "TRANSFER" ||
    payload.webhook_code !== "TRANSFER_EVENTS_UPDATE"
  ) {
    return;
  }

  let afterId = 0;
  while (true) {
    const synced = await syncPlaidTransferEvents(afterId);
    if ("error" in synced) {
      throw new Error(synced.error);
    }

    const events = synced.transferEvents;
    if (events.length === 0) {
      break;
    }

    for (const event of events) {
      await applyPlaidTransferEvent(event);
      afterId = Math.max(afterId, event.event_id);
    }

    if (events.length < 200) {
      break;
    }
  }
}

export async function getVerifiedSetupIntent(
  setupIntentId: string,
  ctx?: Pick<TenantContext, "tenantId" | "organizationId">,
) {
  const stripe = getStripeServer();
  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);

  if (
    typeof setupIntent.payment_method !== "string" ||
    typeof setupIntent.customer !== "string" ||
    setupIntent.status !== "succeeded"
  ) {
    throw new Error("Setup intent has not completed successfully.");
  }

  const tenantId = setupIntent.metadata?.tenantId;
  const organizationId = setupIntent.metadata?.organizationId;

  if (!tenantId || !organizationId) {
    throw new Error("Setup intent metadata is incomplete.");
  }

  if (ctx && (tenantId !== ctx.tenantId || organizationId !== ctx.organizationId)) {
    throw new Error("Setup intent does not belong to this tenant.");
  }

  return setupIntent;
}

export async function syncSetupIntent(setupIntentOrId: string | Stripe.SetupIntent) {
  const setupIntent =
    typeof setupIntentOrId === "string"
      ? await getVerifiedSetupIntent(setupIntentOrId)
      : setupIntentOrId;
  const tenantId = setupIntent.metadata?.tenantId;
  const organizationId = setupIntent.metadata?.organizationId;

  if (
    typeof setupIntent.payment_method !== "string" ||
    typeof setupIntent.customer !== "string" ||
    !tenantId ||
    !organizationId
  ) {
    throw new Error("Setup intent metadata is incomplete.");
  }

  await syncPaymentMethodFromStripe(
    {
      tenantId,
      organizationId,
      sharedUserId: setupIntent.metadata?.sharedUserId || null,
    },
    setupIntent.payment_method,
    setupIntent.customer,
  );

  return setupIntent;
}

export async function handleStripeWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case "setup_intent.succeeded": {
      const setupIntent = event.data.object;
      if (
        typeof setupIntent.payment_method === "string" &&
        typeof setupIntent.customer === "string" &&
        setupIntent.metadata?.tenantId &&
        setupIntent.metadata?.organizationId
      ) {
        await syncPaymentMethodFromStripe(
          {
            tenantId: setupIntent.metadata.tenantId,
            organizationId: setupIntent.metadata.organizationId,
            sharedUserId: setupIntent.metadata.sharedUserId || null,
          },
          setupIntent.payment_method,
          setupIntent.customer,
        );
      }
      break;
    }
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object;
      await markPaymentIntentSucceeded(paymentIntent);
      break;
    }
    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object;
      await prisma.payment_attempts.updateMany({
        where: { stripe_payment_intent_id: paymentIntent.id },
        data: {
          status: paymentIntent.status,
          failure_code: paymentIntent.last_payment_error?.code ?? null,
          failure_message: paymentIntent.last_payment_error?.message ?? null,
          updated_at: new Date(),
        },
      });
      break;
    }
    default:
      break;
  }
}

export function toStripeAmountInMinorUnits(amount: number | { toFixed(scale?: number): string }) {
  const value = typeof amount === "number" ? amount.toFixed(2) : amount.toFixed(2);
  return Number(value.replace(".", ""));
}

function capitalizeCardBrand(brand: string) {
  return brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : "Card";
}

async function getStripePaymentMethodSummary(paymentIntent: Stripe.PaymentIntent) {
  if (typeof paymentIntent.payment_method !== "string") {
    return null;
  }

  return prisma.renter_payment_methods.findUnique({
    where: { stripe_payment_method_id: paymentIntent.payment_method },
    select: {
      payment_provider: true,
      payment_type: true,
      brand: true,
      bank_name: true,
      last4: true,
    },
  });
}

function formatStoredPaymentMethodLabel(method: {
  payment_provider?: string;
  payment_type: string;
  brand: string | null;
  bank_name: string | null;
  last4: string;
}) {
  if (method.payment_type === "us_bank_account") {
    return `${method.bank_name ?? "Bank account"} ending in ${method.last4}`;
  }

  return `${capitalizeCardBrand(method.brand ?? "")} ending in ${method.last4}`;
}

async function applyPlaidTransferEvent(event: {
  event_id: number;
  event_type: string;
  transfer_id?: string | null;
  authorization_id?: string | null;
  failure_reason?: {
    failure_code?: string | null;
    description?: string | null;
  } | null;
}) {
  const plaidWhere: Array<
    | { plaid_transfer_id: string }
    | { plaid_authorization_id: string }
  > = [];

  if (event.transfer_id) {
    plaidWhere.push({ plaid_transfer_id: event.transfer_id });
  }

  if (event.authorization_id) {
    plaidWhere.push({ plaid_authorization_id: event.authorization_id });
  }

  if (plaidWhere.length === 0) {
    return;
  }

  const attempt = await prisma.payment_attempts.findFirst({
    where: {
      payment_provider: "plaid",
      OR: plaidWhere,
    },
    select: {
      id: true,
      payment_id: true,
      renter_payment_method_id: true,
      plaid_last_event_id: true,
      plaid_transfer_id: true,
    },
  });

  if (!attempt) {
    return;
  }

  if (attempt.plaid_last_event_id !== null && attempt.plaid_last_event_id >= BigInt(event.event_id)) {
    return;
  }

  const method = attempt.renter_payment_method_id
    ? await prisma.renter_payment_methods.findUnique({
        where: { id: attempt.renter_payment_method_id },
        select: {
          payment_type: true,
          brand: true,
          bank_name: true,
          last4: true,
        },
      })
    : null;

  const now = new Date();
  const isPaidEvent = event.event_type === "funds_available";
  const isFailureEvent =
    event.event_type === "failed" ||
    event.event_type === "returned" ||
    event.event_type === "cancelled";

  await prisma.$transaction(async (tx) => {
    await tx.payment_attempts.update({
      where: { id: attempt.id },
      data: {
        status: event.event_type,
        plaid_last_event_id: BigInt(event.event_id),
        failure_code: event.failure_reason?.failure_code ?? null,
        failure_message: event.failure_reason?.description ?? null,
        paid_at: isPaidEvent ? now : undefined,
        updated_at: now,
      },
    });

    if (isPaidEvent) {
      await tx.payments.update({
        where: { id: attempt.payment_id },
        data: {
          status: "paid",
          paid_at: now,
          reference: attempt.plaid_transfer_id ?? event.transfer_id ?? null,
          payment_method: method
            ? formatStoredPaymentMethodLabel(method)
            : "ACH payment",
          updated_at: now,
        },
      });
    }

    if (isFailureEvent) {
      await tx.payments.update({
        where: { id: attempt.payment_id },
        data: {
          status: "pending",
          paid_at: null,
          updated_at: now,
        },
      });
    }
  });
}

async function markPaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const paidAt = new Date();
  const paymentMethod = await getStripePaymentMethodSummary(paymentIntent);

  await prisma.$transaction(async (tx) => {
    await tx.payment_attempts.updateMany({
      where: { stripe_payment_intent_id: paymentIntent.id },
      data: {
        status: paymentIntent.status,
        failure_code: null,
        failure_message: null,
        paid_at: paidAt,
        updated_at: paidAt,
      },
    });

    if (paymentIntent.metadata.paymentId) {
      await tx.payments.update({
        where: { id: paymentIntent.metadata.paymentId },
        data: {
          status: "paid",
          paid_at: paidAt,
          reference: paymentIntent.id,
          payment_method: paymentMethod
            ? formatStoredPaymentMethodLabel(paymentMethod)
            : "Online payment",
          updated_at: paidAt,
        },
      });
    }
  });
}
