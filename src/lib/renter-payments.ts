import type Stripe from "stripe";
import type { Prisma } from "../generated/prisma/client";
import type { TenantContext } from "@/lib/renter-auth";
import { prisma } from "@/lib/db";
import { requireOrganizationStripeRentDestination } from "@/lib/organization-payment-destinations";
import { getStripeServer } from "@/lib/stripe";

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateProcessingFee(
  amount: number | { toFixed(scale?: number): string },
  paymentType: "card" | "us_bank_account" | string,
) {
  const numericAmount = Number(
    typeof amount === "number" ? amount.toFixed(2) : amount.toFixed(2),
  );

  if (paymentType === "us_bank_account") {
    return roundCurrency(Math.min(numericAmount * 0.008, 5));
  }

  return roundCurrency(numericAmount * 0.029 + 0.3);
}

function todayDateOnly() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

async function applyDefaultPaymentMethodToFuturePayments(
  tx: Prisma.TransactionClient,
  tenantId: string,
  method: {
    payment_provider?: string;
    payment_type: string;
    brand: string | null;
    bank_name: string | null;
    last4: string;
  } | null,
) {
  await tx.payments.updateMany({
    where: {
      tenant_id: tenantId,
      status: "pending",
      due_date: {
        gte: todayDateOnly(),
      },
    },
    data: {
      payment_method: method ? formatStoredPaymentMethodLabel(method) : null,
      updated_at: new Date(),
    },
  });
}

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
        orderBy: { created_at: "desc" },
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

  const effectiveDefaultPaymentMethodId =
    tenant?.renter_payment_settings?.default_payment_method_id ??
    tenant?.renter_payment_methods.find((method) => method.is_default)?.id ??
    null;

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
          isDefault: method.id === effectiveDefaultPaymentMethodId,
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

    if (shouldBeDefault) {
      await applyDefaultPaymentMethodToFuturePayments(tx, ctx.tenantId, savedMethod);
    }
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
      brand: true,
      bank_name: true,
      last4: true,
    },
  });

  if (!method) {
    throw new Error("Payment method not found.");
  }

  if (method.payment_provider !== "stripe") {
    throw new Error(
      "Only Stripe payment methods can be used for renter payments.",
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

    await applyDefaultPaymentMethodToFuturePayments(tx, ctx.tenantId, method);
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
    select: {
      id: true,
      payment_provider: true,
      payment_type: true,
      brand: true,
      bank_name: true,
      last4: true,
    },
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
          fallbackMethod.payment_provider === "stripe"
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

    await applyDefaultPaymentMethodToFuturePayments(tx, ctx.tenantId, fallbackMethod);
  });
}

export async function setAutopayEnabledForTenant(
  ctx: TenantContext,
  enabled: boolean,
  defaultPaymentMethodId?: string,
) {
  const settings = await prisma.renter_payment_settings.findUnique({
    where: { tenant_id: ctx.tenantId },
    select: {
      default_payment_method_id: true,
    },
  });
  const resolvedDefaultPaymentMethodId =
    defaultPaymentMethodId ?? settings?.default_payment_method_id ?? null;

  const defaultMethod = resolvedDefaultPaymentMethodId
    ? await prisma.renter_payment_methods.findFirst({
      where: {
        id: resolvedDefaultPaymentMethodId,
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
    })
    : await prisma.renter_payment_methods.findFirst({
    where: {
      tenant_id: ctx.tenantId,
      is_default: true,
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

  if (
    enabled &&
    (
      !defaultMethod ||
      defaultMethod.payment_provider !== "stripe" ||
      !defaultMethod.stripe_customer_id ||
      !defaultMethod.stripe_payment_method_id
    )
  ) {
    throw new Error(
      "Add a saved online payment method and make it the default before enabling auto-pay.",
    );
  }

  await prisma.renter_payment_settings.upsert({
    where: { tenant_id: ctx.tenantId },
    update: {
      user_id: ctx.sharedUserId,
      organization_id: ctx.organizationId,
      ...(defaultMethod ? { default_payment_method_id: defaultMethod.id } : {}),
      autopay_enabled: enabled,
      updated_at: new Date(),
    },
    create: {
      tenant_id: ctx.tenantId,
      user_id: ctx.sharedUserId,
      organization_id: ctx.organizationId,
      default_payment_method_id: defaultMethod?.id ?? resolvedDefaultPaymentMethodId,
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
      payment_type: true,
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

  const normalizedAmount = payment.amount.toFixed(2);
  if (normalizedAmount !== args.amount) {
    throw new Error("Payment amount does not match the current charge.");
  }

  const stripe = getStripeServer();
  const idempotencyKey = `${payment.id}:${method.id}:stripe`;
  const existingAttempt = await prisma.payment_attempts.findUnique({
    where: { idempotency_key: idempotencyKey },
    select: {
      id: true,
      stripe_payment_intent_id: true,
      status: true,
    },
  });

  if (existingAttempt?.stripe_payment_intent_id) {
    const existingIntent = await stripe.paymentIntents.retrieve(existingAttempt.stripe_payment_intent_id);
    return {
      id: existingAttempt.id,
      paymentIntentId: existingIntent.id,
      clientSecret: existingIntent.client_secret,
      status: existingIntent.status,
    };
  }

  const processingFee = calculateProcessingFee(payment.amount, method.payment_type);
  const chargeAmount = roundCurrency(Number(payment.amount.toFixed(2)) + processingFee);
  const rentDestination = await requireOrganizationStripeRentDestination(ctx.organizationId);

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: toStripeAmountInMinorUnits(chargeAmount),
      currency: payment.currency.toLowerCase(),
      customer: method.stripe_customer_id,
      payment_method: method.stripe_payment_method_id,
      payment_method_types: [method.payment_type === "us_bank_account" ? "us_bank_account" : "card"],
      confirm: true,
      off_session: false,
      description: `${payment.type} payment`,
      transfer_data: {
        destination: rentDestination.stripeAccountId,
        amount: toStripeAmountInMinorUnits(payment.amount),
      },
      metadata: {
        paymentId: payment.id,
        tenantId: ctx.tenantId,
        organizationId: ctx.organizationId,
        renterPaymentMethodId: method.id,
        stripeDestinationAccountId: rentDestination.stripeAccountId,
        rentAmount: payment.amount.toFixed(2),
        processingFee: processingFee.toFixed(2),
        totalAmount: chargeAmount.toFixed(2),
      },
    },
    { idempotencyKey },
  );

  const attempt = await prisma.payment_attempts.create({
    data: {
      payment_id: payment.id,
      tenant_id: ctx.tenantId,
      user_id: ctx.sharedUserId,
      organization_id: ctx.organizationId,
      renter_payment_method_id: method.id,
      payment_provider: "stripe",
      stripe_payment_intent_id: paymentIntent.id,
      idempotency_key: idempotencyKey,
      amount: chargeAmount,
      currency: payment.currency,
      status: paymentIntent.status,
      failure_code: paymentIntent.last_payment_error?.code ?? null,
      failure_message: paymentIntent.last_payment_error?.message ?? null,
    },
    select: {
      id: true,
      stripe_payment_intent_id: true,
      status: true,
    },
  });

  if (paymentIntent.status === "succeeded") {
    await markPaymentIntentSucceeded(paymentIntent);
  }

  return {
    id: attempt.id,
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
    status: paymentIntent.status,
  };
}

export type AutopayChargeCandidate = {
  tenantId: string;
  organizationId: string;
  sharedUserId: string | null;
  paymentId: string;
  paymentMethodId: string;
  amount: string;
};

export type AutopayChargeResult = {
  paymentId: string;
  outcome: "charged" | "processing" | "failed" | "skipped";
  paymentIntentId?: string;
  stripeStatus?: string;
  failureCode?: string;
  failureMessage?: string;
};

function endOfDay(date: Date) {
  const cutoff = new Date(date);
  cutoff.setHours(23, 59, 59, 999);
  return cutoff;
}

function outcomeFromStripeStatus(status: string): AutopayChargeResult["outcome"] {
  if (status === "succeeded") return "charged";
  if (status === "processing") return "processing";
  return "failed";
}

/**
 * Finds rent charges that should be auto-charged: tenants with auto-pay enabled
 * and a usable default Stripe method, who have pending payments due on or before
 * `now`. Returns one candidate per (payment, method) so each can be charged and
 * retried independently.
 */
export async function getAutopayChargesDue(now: Date = new Date()): Promise<AutopayChargeCandidate[]> {
  const dueCutoff = endOfDay(now);
  const settings = await prisma.renter_payment_settings.findMany({
    where: {
      autopay_enabled: true,
      default_payment_method_id: { not: null },
    },
    select: {
      tenant_id: true,
      organization_id: true,
      user_id: true,
      default_payment_method: {
        select: {
          id: true,
          is_active: true,
          deleted_at: true,
          payment_provider: true,
          stripe_customer_id: true,
          stripe_payment_method_id: true,
        },
      },
    },
  });

  const candidates: AutopayChargeCandidate[] = [];

  for (const setting of settings) {
    const method = setting.default_payment_method;
    if (
      !method ||
      !method.is_active ||
      method.deleted_at ||
      method.payment_provider !== "stripe" ||
      !method.stripe_customer_id ||
      !method.stripe_payment_method_id
    ) {
      continue;
    }

    const duePayments = await prisma.payments.findMany({
      where: {
        tenant_id: setting.tenant_id,
        status: "pending",
        due_date: { lte: dueCutoff },
      },
      select: { id: true, amount: true },
      orderBy: { due_date: "asc" },
    });

    for (const payment of duePayments) {
      candidates.push({
        tenantId: setting.tenant_id,
        organizationId: setting.organization_id,
        sharedUserId: setting.user_id,
        paymentId: payment.id,
        paymentMethodId: method.id,
        amount: payment.amount.toFixed(2),
      });
    }
  }

  return candidates;
}

/**
 * Charges a single due rent payment off-session against the tenant's saved
 * default Stripe method. Never throws on an expected payment failure (declines,
 * authentication_required) — it records the attempt and reports the outcome so
 * one bad charge can't abort the batch. Idempotent per (payment, method).
 */
export async function chargeAutopayPayment(
  candidate: AutopayChargeCandidate,
): Promise<AutopayChargeResult> {
  const payment = await prisma.payments.findFirst({
    where: { id: candidate.paymentId, tenant_id: candidate.tenantId, status: "pending" },
    select: { id: true, amount: true, currency: true, type: true },
  });
  if (!payment) {
    return { paymentId: candidate.paymentId, outcome: "skipped" };
  }

  const method = await prisma.renter_payment_methods.findFirst({
    where: {
      id: candidate.paymentMethodId,
      tenant_id: candidate.tenantId,
      is_active: true,
      deleted_at: null,
    },
    select: {
      id: true,
      payment_provider: true,
      stripe_customer_id: true,
      stripe_payment_method_id: true,
      payment_type: true,
    },
  });
  if (
    !method ||
    method.payment_provider !== "stripe" ||
    !method.stripe_customer_id ||
    !method.stripe_payment_method_id
  ) {
    return { paymentId: candidate.paymentId, outcome: "skipped" };
  }

  const stripe = getStripeServer();
  const idempotencyKey = `${payment.id}:${method.id}:autopay`;

  const existingAttempt = await prisma.payment_attempts.findUnique({
    where: { idempotency_key: idempotencyKey },
    select: { stripe_payment_intent_id: true },
  });
  if (existingAttempt?.stripe_payment_intent_id) {
    const existingIntent = await stripe.paymentIntents.retrieve(existingAttempt.stripe_payment_intent_id);
    return {
      paymentId: candidate.paymentId,
      outcome: outcomeFromStripeStatus(existingIntent.status),
      paymentIntentId: existingIntent.id,
      stripeStatus: existingIntent.status,
    };
  }

  const processingFee = calculateProcessingFee(payment.amount, method.payment_type);
  const chargeAmount = roundCurrency(Number(payment.amount.toFixed(2)) + processingFee);
  const rentDestination = await requireOrganizationStripeRentDestination(candidate.organizationId);

  const baseAttemptData = {
    payment_id: payment.id,
    tenant_id: candidate.tenantId,
    user_id: candidate.sharedUserId,
    organization_id: candidate.organizationId,
    renter_payment_method_id: method.id,
    payment_provider: "stripe",
    idempotency_key: idempotencyKey,
    amount: chargeAmount,
    currency: payment.currency,
  };

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: toStripeAmountInMinorUnits(chargeAmount),
        currency: payment.currency.toLowerCase(),
        customer: method.stripe_customer_id,
        payment_method: method.stripe_payment_method_id,
        payment_method_types: [method.payment_type === "us_bank_account" ? "us_bank_account" : "card"],
        confirm: true,
        off_session: true,
        description: `${payment.type} payment (auto-pay)`,
        transfer_data: {
          destination: rentDestination.stripeAccountId,
          amount: toStripeAmountInMinorUnits(payment.amount),
        },
        metadata: {
          paymentId: payment.id,
          tenantId: candidate.tenantId,
          organizationId: candidate.organizationId,
          renterPaymentMethodId: method.id,
          stripeDestinationAccountId: rentDestination.stripeAccountId,
          rentAmount: payment.amount.toFixed(2),
          processingFee: processingFee.toFixed(2),
          totalAmount: chargeAmount.toFixed(2),
          autopay: "true",
        },
      },
      { idempotencyKey },
    );
  } catch (error) {
    // Off-session failures (card_declined, authentication_required, etc.) reject
    // with a StripeError that still carries the created PaymentIntent. Record the
    // failed attempt and report it — don't throw and abort the rest of the batch.
    const stripeError = error as {
      code?: string;
      message?: string;
      payment_intent?: Stripe.PaymentIntent;
    };
    const failedIntent = stripeError.payment_intent;
    await prisma.payment_attempts.create({
      data: {
        ...baseAttemptData,
        stripe_payment_intent_id: failedIntent?.id ?? null,
        status: failedIntent?.status ?? "failed",
        failure_code: stripeError.code ?? null,
        failure_message: stripeError.message ?? null,
      },
    });
    return {
      paymentId: candidate.paymentId,
      outcome: "failed",
      paymentIntentId: failedIntent?.id,
      stripeStatus: failedIntent?.status,
      failureCode: stripeError.code,
      failureMessage: stripeError.message,
    };
  }

  await prisma.payment_attempts.create({
    data: {
      ...baseAttemptData,
      stripe_payment_intent_id: paymentIntent.id,
      status: paymentIntent.status,
      failure_code: paymentIntent.last_payment_error?.code ?? null,
      failure_message: paymentIntent.last_payment_error?.message ?? null,
    },
  });

  if (paymentIntent.status === "succeeded") {
    await markPaymentIntentSucceeded(paymentIntent);
  }

  return {
    paymentId: candidate.paymentId,
    outcome: outcomeFromStripeStatus(paymentIntent.status),
    paymentIntentId: paymentIntent.id,
    stripeStatus: paymentIntent.status,
  };
}

/**
 * Charges every currently-due auto-pay rent payment. Thin orchestration over
 * {@link getAutopayChargesDue} + {@link chargeAutopayPayment}; the scheduled
 * Inngest function calls these primitives directly for per-payment retries.
 */
export async function runDueAutopayCharges(now: Date = new Date()) {
  const candidates = await getAutopayChargesDue(now);
  const results: AutopayChargeResult[] = [];
  for (const candidate of candidates) {
    results.push(await chargeAutopayPayment(candidate));
  }
  return { processed: candidates.length, results };
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
    case "account.updated": {
      const account = event.data.object;
      await prisma.organizations.updateMany({
        where: { stripe_account_id: account.id },
        data: {
          stripe_charges_enabled: account.charges_enabled ?? false,
          stripe_payouts_enabled: account.payouts_enabled ?? false,
          updated_at: new Date(),
        },
      });
      break;
    }
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
      // updateMany (not update) so an event for an unknown paymentId — e.g. a
      // record that was never created or already removed — no-ops instead of
      // throwing P2025 and bubbling a misleading failure up to the webhook.
      const updated = await tx.payments.updateMany({
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

      if (updated.count === 0) {
        console.warn(
          `[stripe-webhook] payment_intent.succeeded ${paymentIntent.id} references unknown paymentId ${paymentIntent.metadata.paymentId}; no payments row updated`,
        );
      }
    }
  });
}
