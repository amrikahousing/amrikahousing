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
    typeof client.plaid_transactions?.findMany === "function" &&
    typeof client.accounting_transaction_categories?.findMany === "function" &&
    typeof client.accounting_vendor_category_rules?.findMany === "function" &&
    prismaModelHasField(client, "accounting_transaction_categories", "updated_by") &&
    prismaModelHasField(client, "accounting_transaction_categories", "category_source")
  );
}

export const prisma =
  globalForPrisma.prisma && hasCurrentAccountingDelegates(globalForPrisma.prisma)
    ? globalForPrisma.prisma
    : createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
