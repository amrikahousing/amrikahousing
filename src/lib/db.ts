import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: ReturnType<typeof createPrismaClient> };

function prismaModelHasField(
  client: ReturnType<typeof createPrismaClient>,
  model: string,
  field: string,
) {
  const runtimeModel = (
    client as unknown as {
      _runtimeDataModel?: {
        models?: Record<string, { fields?: Array<{ name: string }> }>;
      };
    }
  )._runtimeDataModel?.models?.[model];

  return runtimeModel?.fields?.some((item) => item.name === field) ?? false;
}

function hasCurrentAccountingDelegates(client: ReturnType<typeof createPrismaClient>) {
  return (
    typeof client.plaid_items?.findMany === "function" &&
    typeof client.plaid_institutions?.findMany === "function" &&
    typeof client.plaid_transactions?.findMany === "function" &&
    typeof client.plaid_item_audit_logs?.findMany === "function" &&
    typeof client.plaid_data_deletion_requests?.findMany === "function" &&
    typeof client.manual_transactions?.findMany === "function" &&
    typeof client.accounting_transaction_categories?.findMany === "function" &&
    typeof client.accounting_vendor_category_rules?.findMany === "function" &&
    prismaModelHasField(client, "plaid_items", "sync_enabled") &&
    prismaModelHasField(client, "plaid_items", "last_synced_at") &&
    prismaModelHasField(client, "plaid_institutions", "logo_url") &&
    prismaModelHasField(client, "plaid_transactions", "connection_id") &&
    prismaModelHasField(client, "accounting_transaction_categories", "updated_by") &&
    prismaModelHasField(client, "accounting_transaction_categories", "category_source")
  );
}

function hasCurrentRenterPaymentDelegates(client: ReturnType<typeof createPrismaClient>) {
  return (
    typeof client.renter_payment_methods?.findMany === "function" &&
    typeof client.renter_payment_settings?.findMany === "function" &&
    typeof client.payment_attempts?.findMany === "function" &&
    prismaModelHasField(client, "renter_payment_methods", "payment_type") &&
    prismaModelHasField(client, "renter_payment_methods", "bank_name") &&
    prismaModelHasField(client, "renter_payment_methods", "bank_account_type") &&
    prismaModelHasField(client, "renter_payment_methods", "exp_month") &&
    prismaModelHasField(client, "renter_payment_methods", "exp_year")
  );
}

export const prisma =
  globalForPrisma.prisma &&
  hasCurrentAccountingDelegates(globalForPrisma.prisma) &&
  hasCurrentRenterPaymentDelegates(globalForPrisma.prisma)
    ? globalForPrisma.prisma
    : createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
