import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveSharedUserIdentity } from "@/lib/renter-auth";
import { getTenantPaymentProfile } from "@/lib/renter-payments";
import { PaymentMethodsClient } from "./PaymentMethodsClient";

type SavedPaymentMethodView = {
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

export default async function RenterPaymentMethodsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const identity = await resolveSharedUserIdentity(userId);
  const tenant = identity.email
    ? await prisma.tenants.findFirst({
      where: {
        email: identity.email,
        deleted_at: null,
        ...(identity.sharedUser?.organization_id
          ? { organization_id: identity.sharedUser.organization_id }
          : {}),
      },
      select: {
        id: true,
        organization_id: true,
      },
    })
    : null;

  const paymentProfile = tenant
    ? await getTenantPaymentProfile({
        userId,
        tenantId: tenant.id,
        organizationId: tenant.organization_id,
        sharedUserId: identity.sharedUser?.id ?? null,
      })
    : null;
  const savedPaymentMethods: SavedPaymentMethodView[] =
    paymentProfile?.paymentMethods.map((method) => ({
      ...method,
      paymentProvider: method.paymentProvider === "plaid" ? "plaid" : "stripe",
      paymentType: method.paymentType === "us_bank_account" ? "us_bank_account" : "card",
    })) ?? [];

  return (
    <PaymentMethodsClient
      autopayEnabled={paymentProfile?.renter_payment_settings?.autopay_enabled ?? false}
      defaultPaymentMethodId={paymentProfile?.renter_payment_settings?.default_payment_method_id ?? null}
      savedPaymentMethods={savedPaymentMethods}
      stripePublishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null}
    />
  );
}
