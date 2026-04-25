import type Stripe from "stripe";
import type { TenantContext } from "@/lib/renter-auth";
import { prisma } from "@/lib/db";
import { getStripeServer } from "@/lib/stripe";

const IN_FLIGHT_PAYMENT_ATTEMPT_STATUSES = [
  "requires_action",
  "requires_capture",
  "requires_confirmation",
  "requires_payment_method",
  "processing",
] as const;

export type SavedPaymentMethodSummary = {
  id: string;
  stripePaymentMethodId: string;
  paymentType: "card" | "us_bank_account";
  brand: string | null;
  bankName: string | null;
  bankAccountType: string | null;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  billingName: string | null;
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
      },
    },
  });

  return tenant
    ? {
        ...tenant,
        paymentMethods: tenant.renter_payment_methods.map((method) => ({
          id: method.id,
          stripePaymentMethodId: method.stripe_payment_method_id,
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
    },
  });

  if (!method) {
    throw new Error("Payment method not found.");
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
      stripe_payment_method_id: true,
      is_default: true,
    },
  });

  if (!method) {
    throw new Error("Payment method not found.");
  }

  const stripe = getStripeServer();
  await stripe.paymentMethods.detach(method.stripe_payment_method_id);

  const fallbackMethod = await prisma.renter_payment_methods.findFirst({
    where: {
      tenant_id: ctx.tenantId,
      is_active: true,
      deleted_at: null,
      id: { not: method.id },
    },
    orderBy: { created_at: "desc" },
    select: { id: true },
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
        autopay_enabled: fallbackMethod ? undefined : false,
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

  if (enabled && !defaultMethod) {
    throw new Error("Add and select a default payment method before enabling auto-pay.");
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
      stripe_customer_id: true,
      stripe_payment_method_id: true,
    },
  });

  if (!method) {
    throw new Error("Saved payment method not found.");
  }

  const normalizedAmount = payment.amount.toFixed(2);
  if (normalizedAmount !== args.amount) {
    throw new Error("Payment amount does not match the current charge.");
  }

  const stripe = getStripeServer();
  const existingAttempt = await prisma.payment_attempts.findFirst({
    where: {
      payment_id: payment.id,
      tenant_id: ctx.tenantId,
      renter_payment_method_id: method.id,
      status: {
        in: [...IN_FLIGHT_PAYMENT_ATTEMPT_STATUSES],
      },
    },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      stripe_payment_intent_id: true,
      status: true,
    },
  });

  if (existingAttempt) {
    const existingIntent = await stripe.paymentIntents.retrieve(existingAttempt.stripe_payment_intent_id);
    if (existingIntent.status === "succeeded") {
      await markPaymentIntentSucceeded(existingIntent);
    } else if (existingIntent.status === "requires_payment_method" || existingIntent.status === "canceled") {
      await prisma.payment_attempts.updateMany({
        where: { stripe_payment_intent_id: existingIntent.id },
        data: {
          status: existingIntent.status,
          failure_code: existingIntent.last_payment_error?.code ?? null,
          failure_message: existingIntent.last_payment_error?.message ?? null,
          updated_at: new Date(),
        },
      });
    }

    return {
      attempt: existingAttempt,
      paymentIntent: existingIntent,
    };
  }

  const idempotencyKey = `${payment.id}:${method.id}`;
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: toStripeAmountInMinorUnits(payment.amount),
      currency: payment.currency.toLowerCase(),
      customer: method.stripe_customer_id,
      payment_method: method.stripe_payment_method_id,
      confirmation_method: "automatic",
      confirm: false,
      metadata: {
        organizationId: ctx.organizationId,
        paymentId: payment.id,
        renterPaymentMethodId: method.id,
        tenantId: ctx.tenantId,
        sharedUserId: ctx.sharedUserId ?? "",
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
      stripe_payment_intent_id: paymentIntent.id,
      idempotency_key: idempotencyKey,
      amount: payment.amount,
      currency: payment.currency,
      status: paymentIntent.status,
    },
    select: {
      id: true,
      stripe_payment_intent_id: true,
      status: true,
    },
  });

  return {
    attempt,
    paymentIntent,
  };
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
      payment_type: true,
      brand: true,
      bank_name: true,
      last4: true,
    },
  });
}

function formatStoredPaymentMethodLabel(method: {
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
