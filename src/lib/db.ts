import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: ReturnType<typeof createPrismaClient> };

function hasCurrentAccountingDelegates(client: ReturnType<typeof createPrismaClient>) {
  return (
    typeof client.plaid_items?.findMany === "function" &&
    typeof client.accounting_transaction_categories?.findMany === "function" &&
    typeof client.accounting_vendor_category_rules?.findMany === "function"
  );
}

export const prisma =
  globalForPrisma.prisma && hasCurrentAccountingDelegates(globalForPrisma.prisma)
    ? globalForPrisma.prisma
    : createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
