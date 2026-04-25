import { anthropic } from "@ai-sdk/anthropic";
import { clerkClient } from "@clerk/nextjs/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  canonicalAccountingCategory,
  mergeAccountingCategoryOptions,
} from "@/lib/accounting-categories";
import { prisma } from "@/lib/db";
import {
  cleanVendorName,
  findVendorRuleForTransaction,
  normalizeVendorKey,
  type AccountingVendorRule,
} from "@/lib/accounting-vendor-rules";
import { manualMerchantMetadata } from "@/lib/manual-merchant-logos";
import { decryptPlaidAccessToken, syncPlaidTransactions } from "@/lib/plaid";

export type AccountingTransaction = {
  id: string;
  date: Date | null;
  description: string;
  merchantName: string | null;
  merchantEntityId: string | null;
  merchantLogoUrl: string | null;
  merchantWebsite: string | null;
  categoryIconUrl: string | null;
  counterpartyType: string | null;
  category: string;
  categoryAudit: {
    source: "manual" | "vendor_rule" | null;
    updatedAt: Date | null;
    updatedBy: string | null;
  };
  account: string;
  bank: string;
  amount: number;
  isIncome: boolean;
  source: "plaid" | "rent" | "manual";
};

export type SerializedAccountingTransaction = Omit<
  AccountingTransaction,
  "date" | "categoryAudit"
> & {
  date: string | null;
  categoryAudit: {
    source: "manual" | "vendor_rule" | null;
    updatedAt: string | null;
    updatedBy: string | null;
  };
};

export type AccountSummary = {
  id: string;
  plaidItemId: string | null;
  name: string;
  provider: string;
  institutionLogoUrl: string | null;
  balance: number;
  sync: string;
  status: string;
  icon: string;
};

type PlaidTransaction = {
  transaction_id?: unknown;
  date?: unknown;
  name?: unknown;
  merchant_name?: unknown;
  merchant_entity_id?: unknown;
  logo_url?: unknown;
  website?: unknown;
  personal_finance_category_icon_url?: unknown;
  counterparties?: unknown;
  amount?: unknown;
  personal_finance_category?: {
    primary?: unknown;
    detailed?: unknown;
  } | null;
  category?: unknown;
  account_id?: unknown;
};

type PlaidAccount = {
  account_id?: unknown;
  name?: unknown;
  official_name?: unknown;
  subtype?: unknown;
  type?: unknown;
};

type PlaidCounterparty = {
  name?: unknown;
  type?: unknown;
  entity_id?: unknown;
  logo_url?: unknown;
  website?: unknown;
};

export type AccountingData = {
  transactions: AccountingTransaction[];
  plaidTransactions: AccountingTransaction[];
  rentTransactions: AccountingTransaction[];
  manualTransactions: AccountingTransaction[];
  accountSummaries: AccountSummary[];
};

export type PlaidSyncResult = {
  synced: number;
  added: number;
  modified: number;
  removed: number;
};

const MAX_AI_VENDOR_RULES_PER_SYNC = 40;

const aiVendorRuleOutputSchema = z.object({
  suggestions: z.array(
    z.object({
      vendorKey: z.string(),
      bank: z.string(),
      account: z.string(),
      category: z.string(),
      confidence: z.number(),
      reason: z.string(),
    }),
  ),
});

function parsePlaidDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeCategory(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.replaceAll("_", " ").toLowerCase();
  }

  if (Array.isArray(value)) {
    const firstCategory = value.find(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    );
    if (firstCategory) return firstCategory.toLowerCase();
  }

  return "uncategorized";
}

function amountBucket(amount: number) {
  if (amount < 25) return "under $25";
  if (amount < 100) return "$25-$99";
  if (amount < 500) return "$100-$499";
  if (amount < 1000) return "$500-$999";
  return "$1,000+";
}

function isPaidStatus(status: string) {
  return status === "paid" || status === "completed";
}

function displayActorName(
  actorId: string | null | undefined,
  actorsByClerkId: Map<string, string>,
) {
  if (!actorId) return null;
  return actorsByClerkId.get(actorId) ?? actorId;
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanUrl(value: unknown) {
  const url = cleanString(value);
  if (!url) return null;
  return url.startsWith("https://") || url.startsWith("http://") ? url : null;
}

function preferredCounterparty(value: unknown): PlaidCounterparty | null {
  if (!Array.isArray(value)) return null;
  const counterparties = value.filter(
    (item): item is PlaidCounterparty => item !== null && typeof item === "object",
  );

  return (
    counterparties.find((item) => cleanString(item.type) === "merchant") ??
    counterparties.find((item) => cleanUrl(item.logo_url)) ??
    counterparties[0] ??
    null
  );
}

async function getActorNames(actorIds: string[], orgId: string) {
  const actorsByClerkId = new Map<string, string>();
  if (actorIds.length === 0) return actorsByClerkId;

  const actors = await prisma.users.findMany({
    where: {
      clerk_user_id: { in: actorIds },
      organizations: { clerk_org_id: orgId },
    },
    select: {
      clerk_user_id: true,
      email: true,
      first_name: true,
      last_name: true,
    },
  });

  const actorIdsMissingNames: string[] = [];
  for (const actor of actors) {
    const fullName = [actor.first_name, actor.last_name].filter(Boolean).join(" ");
    actorsByClerkId.set(actor.clerk_user_id, fullName || actor.email || actor.clerk_user_id);
    if (!fullName) {
      actorIdsMissingNames.push(actor.clerk_user_id);
    }
  }

  const clerkLookupIds = Array.from(
    new Set([
      ...actorIds.filter((actorId) => !actorsByClerkId.has(actorId)),
      ...actorIdsMissingNames,
    ]),
  );
  if (clerkLookupIds.length === 0) return actorsByClerkId;

  try {
    const clerk = await clerkClient();
    await Promise.all(
      clerkLookupIds.map(async (actorId) => {
        try {
          const user = await clerk.users.getUser(actorId);
          const firstName =
            user.firstName ??
            metadataString(user.unsafeMetadata as Record<string, unknown> | null, "firstName") ??
            metadataString(user.publicMetadata as Record<string, unknown> | null, "firstName");
          const lastName =
            user.lastName ??
            metadataString(user.unsafeMetadata as Record<string, unknown> | null, "lastName") ??
            metadataString(user.publicMetadata as Record<string, unknown> | null, "lastName");
          const fullName = [firstName, lastName].filter(Boolean).join(" ");
          const email =
            user.primaryEmailAddress?.emailAddress ??
            user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)
              ?.emailAddress;
          actorsByClerkId.set(actorId, fullName || actorsByClerkId.get(actorId) || email || actorId);
        } catch {
          actorsByClerkId.set(actorId, actorsByClerkId.get(actorId) || actorId);
        }
      }),
    );
  } catch {
    for (const actorId of clerkLookupIds) {
      actorsByClerkId.set(actorId, actorsByClerkId.get(actorId) || actorId);
    }
  }

  return actorsByClerkId;
}

type PlaidItemRecord = {
  id: string;
  item_id: string;
  organization_id: string;
  institution_name: string | null;
  status: string;
  sync_enabled: boolean;
  transactions_cursor: string | null;
  last_synced_at: Date | null;
  access_token: string;
  created_by: string | null;
};

type PlaidTxRow = {
  plaid_item_id: string;
  organization_id: string;
  plaid_transaction_id: string;
  source: string;
  connection_id: string | null;
  account_id: string;
  account_name: string | null;
  date: Date | null;
  description: string;
  merchant_name: string | null;
  merchant_entity_id: string | null;
  merchant_logo_url: string | null;
  merchant_website: string | null;
  category_icon_url: string | null;
  counterparty_type: string | null;
  amount: number;
  is_income: boolean;
  category: string;
};

type SyncRuleCandidate = {
  description: string;
  vendorKey: string;
  bank: string;
  account: string;
  sampleCategory: string;
  amountBucket: string;
};

function applyVendorRuleCategoryToPlaidRow(
  row: PlaidTxRow,
  item: Pick<PlaidItemRecord, "institution_name">,
  rules: AccountingVendorRule[],
) {
  const vendorRule = findVendorRuleForTransaction(
    {
      description: row.description,
      bank: item.institution_name ?? "Plaid",
      account: row.account_name ?? item.institution_name ?? "Plaid account",
      source: "plaid",
    },
    rules,
  );

  if (!vendorRule) return row;

  return {
    ...row,
    category: vendorRule.category,
  };
}

function buildSyncRuleCandidates(
  rows: PlaidTxRow[],
  item: Pick<PlaidItemRecord, "institution_name">,
  rules: AccountingVendorRule[],
) {
  const candidates = new Map<string, SyncRuleCandidate>();

  for (const row of rows) {
    if (row.is_income) continue;
    const bank = item.institution_name ?? "Plaid";
    const account = row.account_name ?? item.institution_name ?? "Plaid account";
    const existingRule = findVendorRuleForTransaction(
      {
        description: row.description,
        bank,
        account,
        source: "plaid",
      },
      rules,
    );
    if (existingRule) continue;

    const vendorKey = normalizeVendorKey(row.description);
    if (!vendorKey) continue;

    const candidateKey = `${vendorKey}::${bank}::${account}`;
    if (candidates.has(candidateKey)) continue;

    candidates.set(candidateKey, {
      description: row.description,
      vendorKey,
      bank,
      account,
      sampleCategory: row.category,
      amountBucket: amountBucket(row.amount),
    });
  }

  return Array.from(candidates.values()).slice(0, MAX_AI_VENDOR_RULES_PER_SYNC);
}

async function createAiVendorRulesForSync({
  orgDbId,
  userId,
  candidates,
  categoryOptions,
}: {
  orgDbId: string;
  userId: string | null;
  candidates: SyncRuleCandidate[];
  categoryOptions: string[];
}) {
  if (!process.env.ANTHROPIC_API_KEY || candidates.length === 0) return [];

  try {
    const result = await generateText({
      model: anthropic(process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001"),
      system:
        "You categorize rental property accounting vendors. Return one reusable vendor-to-category mapping for each vendor context. Prefer the provided categories when they fit. Use clean accounting category names. Never invent facts.",
      prompt: JSON.stringify({
        instructions: [
          "Return one category suggestion for every vendor context provided.",
          "Choose a stable accounting category suitable for future matching.",
          "Use confidence from 0 to 1.",
          "Keep reasons under 80 characters.",
        ],
        availableCategories: categoryOptions,
        vendorContexts: candidates.map((candidate) => ({
          vendor: cleanVendorName(candidate.description),
          vendorKey: candidate.vendorKey,
          bank: candidate.bank,
          account: candidate.account,
          sampleCategory: candidate.sampleCategory,
          amountBucket: candidate.amountBucket,
        })),
      }),
      output: Output.object({
        schema: aiVendorRuleOutputSchema,
        name: "vendor_category_rule_suggestions",
      }),
    });

    const candidateKeys = new Set(
      candidates.map((candidate) => `${candidate.vendorKey}::${candidate.bank}::${candidate.account}`),
    );

    const savedRules: AccountingVendorRule[] = [];
    for (const suggestion of result.output.suggestions) {
      const vendorKey = normalizeVendorKey(suggestion.vendorKey);
      const bank = suggestion.bank.trim().replace(/\s+/g, " ").slice(0, 120);
      const account = suggestion.account.trim().replace(/\s+/g, " ").slice(0, 160);
      const candidateKey = `${vendorKey}::${bank}::${account}`;
      if (!candidateKeys.has(candidateKey) || !vendorKey) continue;

      const candidate = candidates.find(
        (item) => item.vendorKey === vendorKey && item.bank === bank && item.account === account,
      );
      if (!candidate) continue;

      const category = canonicalAccountingCategory(suggestion.category, categoryOptions);
      if (!category) continue;

      const confidence = Math.max(0, Math.min(1, suggestion.confidence));
      const reason = suggestion.reason.trim().replace(/\s+/g, " ").slice(0, 160) || null;

      const rule = await prisma.accounting_vendor_category_rules.upsert({
        where: {
          accounting_vendor_rules_org_vendor_context_key: {
            organization_id: orgDbId,
            vendor_key: vendorKey,
            bank,
            account,
          },
        },
        create: {
          organization_id: orgDbId,
          vendor_key: vendorKey,
          vendor_name: cleanVendorName(candidate.description),
          category,
          bank,
          account,
          confidence,
          reason,
          created_by: userId,
        },
        update: {
          vendor_name: cleanVendorName(candidate.description),
          category,
          confidence,
          reason,
          updated_at: new Date(),
        },
        select: {
          id: true,
          vendor_key: true,
          vendor_name: true,
          category: true,
          bank: true,
          account: true,
          confidence: true,
          reason: true,
          created_by: true,
          updated_at: true,
        },
      });

      savedRules.push(rule);
    }

    return savedRules;
  } catch (error) {
    console.error("[syncPlaidItemsToDb.aiVendorRules]", error);
    return [];
  }
}

function mapPlaidTxToRow(
  transaction: PlaidTransaction,
  item: PlaidItemRecord,
  accountsById: Map<string, string>,
  rules: AccountingVendorRule[],
): PlaidTxRow | null {
  if (typeof transaction.transaction_id !== "string") return null;
  const amount = typeof transaction.amount === "number" ? transaction.amount : 0;
  const counterparty = preferredCounterparty(transaction.counterparties);
  const merchantName = cleanString(transaction.merchant_name) ?? cleanString(counterparty?.name);
  const merchant =
    merchantName ??
    (typeof transaction.name === "string" && transaction.name.trim()
      ? transaction.name
      : "Plaid transaction");
  const merchantEntityId =
    cleanString(transaction.merchant_entity_id) ?? cleanString(counterparty?.entity_id);
  const merchantLogoUrl =
    cleanUrl(transaction.logo_url) ?? cleanUrl(counterparty?.logo_url);
  const merchantWebsite =
    cleanUrl(transaction.website) ?? cleanString(counterparty?.website);
  const categoryIconUrl = cleanUrl(transaction.personal_finance_category_icon_url);
  const counterpartyType = cleanString(counterparty?.type);
  const category = normalizeCategory(
    transaction.personal_finance_category?.primary ?? transaction.category,
  );
  const accountKey = typeof transaction.account_id === "string" ? transaction.account_id : "";

  return applyVendorRuleCategoryToPlaidRow(
    {
      plaid_item_id: item.id,
      organization_id: item.organization_id,
      plaid_transaction_id: transaction.transaction_id,
      source: "plaid",
      connection_id: item.item_id,
      account_id: accountKey,
      account_name: accountsById.get(accountKey) ?? item.institution_name ?? null,
      date: parsePlaidDate(transaction.date),
      description: merchant,
      merchant_name: merchantName ?? merchant,
      merchant_entity_id: merchantEntityId,
      merchant_logo_url: merchantLogoUrl,
      merchant_website: merchantWebsite,
      category_icon_url: categoryIconUrl,
      counterparty_type: counterpartyType,
      amount: Math.abs(amount),
      is_income: amount < 0,
      category,
    },
    item,
    rules,
  );
}

function buildAccountsById(
  accounts: Array<Record<string, unknown>>,
  institutionName: string | null,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const account of accounts as PlaidAccount[]) {
    if (typeof account.account_id !== "string") continue;
    const officialName =
      typeof account.official_name === "string" && account.official_name.trim()
        ? account.official_name.trim()
        : null;
    const shortName =
      typeof account.name === "string" && account.name.trim()
        ? account.name.trim()
        : null;
    const subtype =
      typeof account.subtype === "string" && account.subtype.trim()
        ? account.subtype.trim()
        : typeof account.type === "string" && account.type.trim()
          ? account.type.trim()
          : null;

    // Prefer official_name, then name; if those equal the institution name
    // (uninformative), append subtype to disambiguate multiple sub-accounts.
    let name = officialName ?? shortName ?? institutionName ?? "Plaid account";
    if (name === institutionName && subtype) {
      name = `${institutionName} ${subtype}`;
    }
    map.set(account.account_id, name);
  }
  return map;
}

export async function syncPlaidItemsToDb(orgId: string): Promise<PlaidSyncResult> {
  const [plaidItems, vendorRules] = await Promise.all([
    prisma.plaid_items.findMany({
      where: {
        organizations: { clerk_org_id: orgId },
        status: "connected",
        sync_enabled: true,
        hidden_at: null,
      },
      orderBy: { created_at: "desc" },
    }),
    prisma.accounting_vendor_category_rules.findMany({
      where: {
        organizations: { clerk_org_id: orgId },
      },
      orderBy: [{ updated_at: "desc" }, { created_at: "desc" }],
      select: {
        id: true,
        vendor_key: true,
        vendor_name: true,
        category: true,
        bank: true,
        account: true,
        confidence: true,
        reason: true,
        created_by: true,
        updated_at: true,
      },
    }),
  ]);

  let totalAdded = 0;
  let totalModified = 0;
  let totalRemoved = 0;
  let synced = 0;
  const categoryOptions = mergeAccountingCategoryOptions(
    vendorRules.map((rule) => rule.category),
  );

  for (const item of plaidItems.slice(0, 5)) {
    try {
      const storedCount = await prisma.plaid_transactions.count({
        where: { plaid_item_id: item.id },
      });
      const missingMetadataCount = await prisma.plaid_transactions.count({
        where: { plaid_item_id: item.id, category_icon_url: null },
      });
      const cursor =
        storedCount === 0 || missingMetadataCount > 0
          ? null
          : item.transactions_cursor;

      const accessToken = decryptPlaidAccessToken(item.access_token);
      const syncResult = await syncPlaidTransactions({
        accessToken,
        cursor,
      });

      if ("error" in syncResult) continue;

      const accountsById = buildAccountsById(syncResult.accounts, item.institution_name);
      const rawAddedRows = (syncResult.added as PlaidTransaction[])
        .map((t) => mapPlaidTxToRow(t, item, accountsById, []))
        .filter((r): r is PlaidTxRow => r !== null);
      const rawModifiedRows = (syncResult.modified as PlaidTransaction[])
        .map((t) => mapPlaidTxToRow(t, item, accountsById, []))
        .filter((r): r is PlaidTxRow => r !== null);
      const aiRuleCandidates = buildSyncRuleCandidates(
        [...rawAddedRows, ...rawModifiedRows],
        item,
        vendorRules,
      );
      const aiRules = await createAiVendorRulesForSync({
        orgDbId: item.organization_id,
        userId: item.created_by,
        candidates: aiRuleCandidates,
        categoryOptions,
      });
      const syncRules = aiRules.length > 0 ? [...aiRules, ...vendorRules] : vendorRules;

      const addedRows = (syncResult.added as PlaidTransaction[])
        .map((t) => mapPlaidTxToRow(t, item, accountsById, syncRules))
        .filter((r): r is PlaidTxRow => r !== null);

      if (addedRows.length > 0) {
        await prisma.plaid_transactions.createMany({
          data: addedRows,
          skipDuplicates: true,
        });
        for (const row of addedRows) {
          await prisma.plaid_transactions.updateMany({
            where: {
              plaid_item_id: row.plaid_item_id,
              plaid_transaction_id: row.plaid_transaction_id,
            },
            data: {
              source: row.source,
              connection_id: row.connection_id,
              account_name: row.account_name,
              merchant_name: row.merchant_name,
              merchant_entity_id: row.merchant_entity_id,
              merchant_logo_url: row.merchant_logo_url,
              merchant_website: row.merchant_website,
              category_icon_url: row.category_icon_url,
              counterparty_type: row.counterparty_type,
              category: row.category,
              updated_at: new Date(),
            },
          });
        }
        totalAdded += addedRows.length;
      }

      for (const t of syncResult.modified as PlaidTransaction[]) {
        if (typeof t.transaction_id !== "string") continue;
        const row = mapPlaidTxToRow(t, item, accountsById, syncRules);
        if (!row) continue;
        await prisma.plaid_transactions.updateMany({
          where: { plaid_item_id: item.id, plaid_transaction_id: t.transaction_id },
          data: {
            date: row.date,
            description: row.description,
            amount: row.amount,
            is_income: row.is_income,
            category: row.category,
            source: row.source,
            connection_id: row.connection_id,
            account_name: row.account_name,
            merchant_name: row.merchant_name,
            merchant_entity_id: row.merchant_entity_id,
            merchant_logo_url: row.merchant_logo_url,
            merchant_website: row.merchant_website,
            category_icon_url: row.category_icon_url,
            counterparty_type: row.counterparty_type,
            updated_at: new Date(),
          },
        });
        totalModified++;
      }

      const removedIds = (syncResult.removed as Array<Record<string, unknown>>)
        .map((t) => t.transaction_id)
        .filter((id): id is string => typeof id === "string");

      if (removedIds.length > 0) {
        await prisma.plaid_transactions.deleteMany({
          where: { plaid_item_id: item.id, plaid_transaction_id: { in: removedIds } },
        });
        totalRemoved += removedIds.length;
      }

      await prisma.plaid_items.update({
        where: { id: item.id },
        data: {
          transactions_cursor: syncResult.nextCursor ?? item.transactions_cursor,
          last_synced_at: new Date(),
          updated_at: new Date(),
        },
      });

      synced++;
    } catch {
      continue;
    }
  }

  return { synced, added: totalAdded, modified: totalModified, removed: totalRemoved };
}

async function plaidTransactionsQuery(orgId: string) {
  return prisma.plaid_transactions.findMany({
    where: {
      plaid_items: {
        organizations: { clerk_org_id: orgId },
        hidden_at: null,
      },
    },
    include: {
      plaid_items: {
        select: {
          id: true,
          institution_name: true,
          status: true,
          sync_enabled: true,
          last_synced_at: true,
          plaid_institutions: {
            select: {
              logo_url: true,
            },
          },
        },
      },
    },
    orderBy: { date: "desc" },
    take: 1000,
  });
}

async function plaidItemsQuery(orgId: string) {
  return prisma.plaid_items.findMany({
    where: { organizations: { clerk_org_id: orgId }, hidden_at: null },
    select: {
      id: true,
      institution_name: true,
      status: true,
      sync_enabled: true,
      last_synced_at: true,
      plaid_institutions: {
        select: {
          logo_url: true,
        },
      },
    },
  });
}

export async function getAccountingData(orgId: string): Promise<AccountingData> {
  const [payments, manualRows, initialPlaidTxRows, categoryOverrides, vendorRules, plaidItems] =
    await Promise.all([
    prisma.payments.findMany({
      where: {
        leases: {
          units: {
            deleted_at: null,
            properties: {
              deleted_at: null,
              organizations: { clerk_org_id: orgId },
            },
          },
        },
      },
      include: {
        tenants: true,
        leases: {
          include: {
            units: {
              include: {
                properties: true,
              },
            },
          },
        },
      },
      orderBy: [{ paid_at: "desc" }, { due_date: "desc" }, { created_at: "desc" }],
      take: 250,
    }),
    prisma.manual_transactions.findMany({
      where: {
        organizations: { clerk_org_id: orgId },
        deleted_at: null,
      },
      orderBy: [{ date: "desc" }, { created_at: "desc" }],
      take: 1000,
    }),
    plaidTransactionsQuery(orgId),
    prisma.accounting_transaction_categories.findMany({
      where: {
        organizations: { clerk_org_id: orgId },
      },
      select: {
        source: true,
        transaction_id: true,
        category: true,
        category_source: true,
        created_by: true,
        updated_by: true,
        updated_at: true,
      },
    }),
    prisma.accounting_vendor_category_rules.findMany({
      where: {
        organizations: { clerk_org_id: orgId },
      },
      orderBy: [{ updated_at: "desc" }, { created_at: "desc" }],
      select: {
        id: true,
        vendor_key: true,
        vendor_name: true,
        category: true,
        bank: true,
        account: true,
        confidence: true,
        reason: true,
        created_by: true,
        updated_at: true,
      },
    }),
    plaidItemsQuery(orgId),
  ]);

  let plaidTxRows = initialPlaidTxRows;
  const syncablePlaidItems = plaidItems.filter(
    (item) => item.status === "connected" && item.sync_enabled,
  );
  if (syncablePlaidItems.length > 0) {
    const itemIdsWithTx = new Set(initialPlaidTxRows.map((r) => r.plaid_items.id));
    const anyItemMissingTx = syncablePlaidItems.some(
      (item) => !itemIdsWithTx.has(item.id),
    );
    const anyTxMissingDetails = initialPlaidTxRows.some(
      (row) => row.category_icon_url === null,
    );
    if (anyItemMissingTx || anyTxMissingDetails) {
      await syncPlaidItemsToDb(orgId);
      plaidTxRows = await plaidTransactionsQuery(orgId);
    }
  }

  const rules: AccountingVendorRule[] = vendorRules;
  const actorIds = Array.from(
    new Set(
      [
        ...manualRows.flatMap((transaction) => [
          transaction.updated_by,
          transaction.created_by,
        ]),
        ...categoryOverrides.flatMap((override) => [
          override.updated_by,
          override.created_by,
        ]),
        ...vendorRules.map((rule) => rule.created_by),
      ].filter((actorId): actorId is string => Boolean(actorId)),
    ),
  );
  const actorsByClerkId = await getActorNames(actorIds, orgId);
  const categoryOverridesByTransaction = new Map(
    categoryOverrides.map((override) => [
      `${override.source}:${override.transaction_id}`,
      override,
    ]),
  );
  const applyCategoryOverride = (transaction: AccountingTransaction) => {
    const manualOverride = categoryOverridesByTransaction.get(
      `${transaction.source}:${transaction.id}`,
    );
    const vendorRule = findVendorRuleForTransaction(transaction, rules);
    const auditActorId = manualOverride
      ? manualOverride.updated_by ?? manualOverride.created_by
      : vendorRule?.created_by;
    const auditSource: AccountingTransaction["categoryAudit"]["source"] = manualOverride
      ? manualOverride.category_source === "manual"
        ? "manual"
        : "vendor_rule"
      : vendorRule
        ? "vendor_rule"
        : null;

    return {
      ...transaction,
      category: manualOverride?.category ?? vendorRule?.category ?? transaction.category,
      categoryAudit: {
        source: auditSource,
        updatedAt: manualOverride?.updated_at ?? vendorRule?.updated_at ?? null,
        updatedBy: displayActorName(auditActorId, actorsByClerkId),
      },
    };
  };

  const plaidTransactions: AccountingTransaction[] = plaidTxRows.map((row) => ({
    id: `plaid-${row.plaid_transaction_id}`,
    date: row.date,
    description: row.description,
    merchantName: row.merchant_name,
    merchantEntityId: row.merchant_entity_id,
    merchantLogoUrl: row.merchant_logo_url,
    merchantWebsite: row.merchant_website,
    categoryIconUrl: row.category_icon_url,
    counterpartyType: row.counterparty_type,
    category: row.category,
    categoryAudit: {
      source: null,
      updatedAt: null,
      updatedBy: null,
    },
    account: row.account_name ?? row.plaid_items.institution_name ?? "Plaid account",
    bank: row.plaid_items.institution_name ?? "Plaid",
    amount: Math.abs(Number(row.amount)),
    isIncome: row.is_income,
    source: "plaid",
  }));

  const plaidAccountSummaries = new Map<string, AccountSummary>();
  for (const row of plaidTxRows) {
    const key = row.account_id;
    if (!plaidAccountSummaries.has(key)) {
      plaidAccountSummaries.set(key, {
        id: key,
        plaidItemId: row.plaid_items.id,
        name: row.account_name ?? row.plaid_items.institution_name ?? "Account",
        provider: row.plaid_items.institution_name ?? "Plaid",
        institutionLogoUrl: row.plaid_items.plaid_institutions?.logo_url ?? null,
        balance: 0,
        sync: "synced",
        status:
          row.plaid_items.status === "connected" && row.plaid_items.sync_enabled
            ? "Connected"
            : "Disconnected",
        icon: "bank",
      });
    }
    const summary = plaidAccountSummaries.get(key)!;
    const amt = Math.abs(Number(row.amount));
    summary.balance += row.is_income ? amt : -amt;
  }

  // Ensure items with no transactions still appear so they can be removed
  const itemIdsInSummaries = new Set(
    Array.from(plaidAccountSummaries.values()).map((s) => s.plaidItemId),
  );
  for (const item of plaidItems) {
    if (!itemIdsInSummaries.has(item.id)) {
      const key = `item:${item.id}`;
      plaidAccountSummaries.set(key, {
        id: key,
        plaidItemId: item.id,
        name: item.institution_name ?? "Connected Account",
        provider: item.institution_name ?? "Plaid",
        institutionLogoUrl: item.plaid_institutions?.logo_url ?? null,
        balance: 0,
        sync: item.last_synced_at ? "synced" : "sync needed",
        status:
          item.status === "connected" && item.sync_enabled
            ? "Connected"
            : "Disconnected",
        icon: "bank",
      });
    }
  }

  const rentTransactions: AccountingTransaction[] = payments.map((payment) => {
    const tenantName = payment.tenants
      ? `${payment.tenants.first_name} ${payment.tenants.last_name}`
      : "Tenant";
    const unit = payment.leases.units;
    const property = unit.properties;
    const isIncome = isPaidStatus(payment.status);

    return {
      id: payment.id,
      date: payment.paid_at ?? payment.due_date,
      description:
        payment.type === "rent"
          ? `Tenant Payment - ${tenantName}`
          : `${payment.type} - ${tenantName}`,
      merchantName: tenantName,
      merchantEntityId: null,
      merchantLogoUrl: null,
      merchantWebsite: null,
      categoryIconUrl: null,
      counterpartyType: null,
      category: payment.type === "rent" ? "Income" : payment.type,
      categoryAudit: {
        source: null,
        updatedAt: null,
        updatedBy: null,
      },
      account: `${property.name}${unit.unit_number ? ` Unit ${unit.unit_number}` : ""}`,
      bank: "Amrika Housing",
      amount: Number(payment.amount ?? 0),
      isIncome,
      source: "rent",
    };
  });

  const manualTransactions: AccountingTransaction[] = manualRows.map((transaction) => {
    const merchant = manualMerchantMetadata(transaction.description);

    return {
      id: transaction.id,
      date: transaction.date,
      description: transaction.description,
      merchantName: merchant.merchantName,
      merchantEntityId: null,
      merchantLogoUrl: merchant.merchantLogoUrl,
      merchantWebsite: merchant.merchantWebsite,
      categoryIconUrl: null,
      counterpartyType: null,
      category: transaction.category,
      categoryAudit: {
        source: "manual",
        updatedAt: transaction.updated_at,
        updatedBy: displayActorName(
          transaction.updated_by ?? transaction.created_by,
          actorsByClerkId,
        ),
      },
      account: transaction.account_label,
      bank: "Manual",
      amount: Math.abs(Number(transaction.amount)),
      isIncome: transaction.is_income,
      source: "manual",
    };
  });

  return {
    transactions: sortTransactionsByDate([
      ...plaidTransactions.map(applyCategoryOverride),
      ...rentTransactions.map(applyCategoryOverride),
      ...manualTransactions,
    ]),
    plaidTransactions: plaidTransactions.map(applyCategoryOverride),
    rentTransactions: rentTransactions.map(applyCategoryOverride),
    manualTransactions,
    accountSummaries: Array.from(plaidAccountSummaries.values()),
  };
}

export function sortTransactionsByDate(transactions: AccountingTransaction[]) {
  return [...transactions].sort(
    (a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0),
  );
}

export function serializeAccountingTransaction(
  transaction: AccountingTransaction,
): SerializedAccountingTransaction {
  return {
    ...transaction,
    date: transaction.date ? transaction.date.toISOString() : null,
    categoryAudit: {
      ...transaction.categoryAudit,
      updatedAt: transaction.categoryAudit.updatedAt
        ? transaction.categoryAudit.updatedAt.toISOString()
        : null,
    },
  };
}
