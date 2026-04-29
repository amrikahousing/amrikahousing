import crypto from "crypto";

type PlaidErrorResponse = {
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
  request_id?: string;
};

type PlaidLinkTokenResponse = {
  link_token: string;
  expiration: string;
  request_id: string;
};

type PlaidExchangeResponse = {
  access_token: string;
  item_id: string;
  request_id: string;
};

type PlaidTransactionsSyncResponse = {
  added: Array<Record<string, unknown>>;
  modified: Array<Record<string, unknown>>;
  removed: Array<Record<string, unknown>>;
  accounts: Array<Record<string, unknown>>;
  next_cursor: string;
  has_more: boolean;
  transactions_update_status?: string;
  request_id: string;
};

type PlaidInstitutionResponse = {
  institution?: {
    institution_id?: string;
    name?: string;
    logo?: string | null;
  };
  request_id: string;
};

type PlaidAccountsGetResponse = {
  accounts?: Array<Record<string, unknown>>;
  request_id: string;
};

type PlaidTransferCapabilitiesResponse = {
  institution_supported_networks?: {
    rtp?: {
      credit?: boolean;
    } | null;
    rfp?: {
      debit?: boolean;
      max_amount?: string | null;
      iso_currency_code?: string | null;
    } | null;
  } | null;
  request_id: string;
};

type PlaidTransferAuthorizationDecision = "approved" | "declined";

type PlaidTransferAuthorizationResponse = {
  authorization: {
    id: string;
    decision: PlaidTransferAuthorizationDecision;
    decision_rationale?: {
      code?: string | null;
      description?: string | null;
    } | null;
  };
  request_id: string;
};

type PlaidTransferCreateResponse = {
  transfer: {
    id: string;
    status: string;
    authorization_id: string;
  };
  request_id: string;
};

type PlaidTransferEvent = {
  event_id: number;
  event_type: string;
  timestamp: string;
  transfer_id?: string | null;
  account_id?: string | null;
  authorization_id?: string | null;
  failure_reason?: {
    failure_code?: string | null;
    description?: string | null;
  } | null;
};

type PlaidTransferEventSyncResponse = {
  transfer_events: PlaidTransferEvent[];
  request_id: string;
};

type PlaidTransferOriginatorFundingAccountCreateResponse = {
  funding_account_id: string;
  request_id: string;
};

export type PlaidLinkAccount = {
  id?: string | null;
  name?: string | null;
  mask?: string | null;
  subtype?: string | null;
  type?: string | null;
};

export type PlaidLinkSuccessMetadata = {
  institution?: {
    institution_id?: string | null;
    name?: string | null;
    logo?: string | null;
  } | null;
  accounts?: PlaidLinkAccount[] | null;
  link_session_id?: string | null;
};

const TOKEN_ENCRYPTION_ALGORITHM = "aes-256-gcm";

const PLAID_ENV_URLS: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

export function getPlaidConfig() {
  const env = process.env.PLAID_ENV ?? "sandbox";
  const baseUrl = PLAID_ENV_URLS[env];
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;

  if (!baseUrl) {
    return { error: `Unsupported PLAID_ENV: ${env}` };
  }

  if (!clientId || !secret) {
    return {
      error:
        "Plaid is not configured. Add PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV.",
    };
  }

  return { baseUrl, clientId, secret };
}

function plaidErrorMessage(body: PlaidErrorResponse, fallback: string) {
  return body.display_message ?? body.error_message ?? body.error_code ?? fallback;
}

async function plaidPost<TResponse extends object>(
  path: string,
  payload: Record<string, unknown>,
  fallback: string,
) {
  const config = getPlaidConfig();
  if ("error" in config) return { error: config.error, status: 501 as const };

  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      secret: config.secret,
      ...payload,
    }),
  });
  const body = (await response.json()) as TResponse & PlaidErrorResponse;

  if (!response.ok) {
    return {
      error: plaidErrorMessage(body, fallback),
      status: response.status,
    };
  }

  return { data: body };
}

export async function createPlaidLinkToken({
  userId,
  clientName,
}: {
  userId: string;
  clientName: string;
}) {
  const result = await plaidPost<PlaidLinkTokenResponse>(
    "/link/token/create",
    {
      client_name: clientName,
      country_codes: ["US"],
      language: "en",
      products: ["transactions"],
      user: {
        client_user_id: userId,
      },
    },
    "Could not create Plaid link token.",
  );

  if ("error" in result) return { error: result.error, status: result.status };

  return {
    linkToken: result.data.link_token,
    expiration: result.data.expiration,
  };
}

export async function createPlaidTransferLinkToken({
  userId,
  clientName,
}: {
  userId: string;
  clientName: string;
}) {
  const result = await plaidPost<PlaidLinkTokenResponse>(
    "/link/token/create",
    {
      client_name: clientName,
      country_codes: ["US"],
      language: "en",
      products: ["transfer"],
      user: {
        client_user_id: userId,
      },
    },
    "Could not create Plaid transfer link token.",
  );

  if ("error" in result) return { error: result.error, status: result.status };

  return {
    linkToken: result.data.link_token,
    expiration: result.data.expiration,
  };
}

export async function exchangePlaidPublicToken(publicToken: string) {
  const result = await plaidPost<PlaidExchangeResponse>(
    "/item/public_token/exchange",
    { public_token: publicToken },
    "Could not connect this Plaid account.",
  );

  if ("error" in result) return { error: result.error, status: result.status };

  return {
    accessToken: result.data.access_token,
    itemId: result.data.item_id,
  };
}

export async function getPlaidInstitution({
  institutionId,
}: {
  institutionId: string;
}) {
  const result = await plaidPost<PlaidInstitutionResponse>(
    "/institutions/get_by_id",
    {
      institution_id: institutionId,
      country_codes: ["US"],
      options: {
        include_optional_metadata: true,
      },
    },
    "Could not fetch Plaid institution.",
  );

  if ("error" in result) return { error: result.error, status: result.status };

  return { institution: result.data.institution ?? null };
}

export async function getPlaidAccounts({
  accessToken,
}: {
  accessToken: string;
}) {
  const result = await plaidPost<PlaidAccountsGetResponse>(
    "/accounts/get",
    {
      access_token: accessToken,
    },
    "Could not fetch Plaid accounts.",
  );

  if ("error" in result) return { error: result.error, status: result.status };

  return {
    accounts: result.data.accounts ?? [],
  };
}

export async function getPlaidTransferCapabilities(args: {
  accessToken: string;
  accountId: string;
}) {
  const result = await plaidPost<PlaidTransferCapabilitiesResponse>(
    "/transfer/capabilities/get",
    {
      access_token: args.accessToken,
      account_id: args.accountId,
    },
    "Could not determine Plaid transfer eligibility.",
  );

  if ("error" in result) return { error: result.error, status: result.status };

  return {
    institutionSupported: true,
    institutionSupportedNetworks: result.data.institution_supported_networks ?? null,
  };
}

export async function createPlaidTransferAuthorization(args: {
  accessToken: string;
  accountId: string;
  legalName: string;
  amount: string;
  idempotencyKey: string;
  emailAddress?: string | null;
  fundingAccountId?: string | null;
}) {
  const result = await plaidPost<PlaidTransferAuthorizationResponse>(
    "/transfer/authorization/create",
    {
      access_token: args.accessToken,
      account_id: args.accountId,
      funding_account_id: args.fundingAccountId ?? undefined,
      type: "debit",
      network: "ach",
      ach_class: "web",
      amount: args.amount,
      user: {
        legal_name: args.legalName,
        email_address: args.emailAddress ?? undefined,
      },
      idempotency_key: args.idempotencyKey,
    },
    "Could not authorize the ACH transfer.",
  );

  if ("error" in result) return { error: result.error, status: result.status };

  return {
    authorizationId: result.data.authorization.id,
    decision: result.data.authorization.decision,
    decisionRationale: result.data.authorization.decision_rationale ?? null,
  };
}

export async function createPlaidTransfer(args: {
  authorizationId: string;
  accessToken: string;
  accountId: string;
  amount: string;
  description: string;
  metadata?: Record<string, string>;
  fundingAccountId?: string | null;
}) {
  const result = await plaidPost<PlaidTransferCreateResponse>(
    "/transfer/create",
    {
      authorization_id: args.authorizationId,
      access_token: args.accessToken,
      account_id: args.accountId,
      funding_account_id: args.fundingAccountId ?? undefined,
      amount: args.amount,
      description: args.description,
      metadata: args.metadata,
    },
    "Could not create the ACH transfer.",
  );

  if ("error" in result) return { error: result.error, status: result.status };

  return {
    transferId: result.data.transfer.id,
    authorizationId: result.data.transfer.authorization_id,
    status: result.data.transfer.status,
  };
}

export async function syncPlaidTransferEvents(afterId: number) {
  const result = await plaidPost<PlaidTransferEventSyncResponse>(
    "/transfer/event/sync",
    { after_id: afterId, count: 200 },
    "Could not sync Plaid transfer events.",
  );

  if ("error" in result) return { error: result.error, status: result.status };

  return {
    transferEvents: result.data.transfer_events ?? [],
  };
}

export async function createPlaidOriginatorFundingAccount(args: {
  originatorClientId: string;
  accessToken: string;
  accountId: string;
  displayName?: string | null;
}) {
  const result = await plaidPost<PlaidTransferOriginatorFundingAccountCreateResponse>(
    "/transfer/originator/funding_account/create",
    {
      originator_client_id: args.originatorClientId,
      funding_account: {
        access_token: args.accessToken,
        account_id: args.accountId,
        display_name: args.displayName ?? undefined,
      },
    },
    "Could not connect this receiving account for Plaid Transfer.",
  );

  if ("error" in result) return { error: result.error, status: result.status };

  return {
    fundingAccountId: result.data.funding_account_id,
  };
}

export function encryptPlaidAccessToken(accessToken: string) {
  const secret =
    process.env.PLAID_TOKEN_ENCRYPTION_KEY ??
    process.env.PLAID_SECRET ??
    process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("Missing server secret for Plaid token encryption.");
  }

  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(TOKEN_ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(accessToken, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptPlaidAccessToken(encryptedAccessToken: string) {
  const secret =
    process.env.PLAID_TOKEN_ENCRYPTION_KEY ??
    process.env.PLAID_SECRET ??
    process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("Missing server secret for Plaid token decryption.");
  }

  const [version, ivValue, tagValue, encryptedValue] = encryptedAccessToken.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Unsupported Plaid token format.");
  }

  const key = crypto.createHash("sha256").update(secret).digest();
  const decipher = crypto.createDecipheriv(
    TOKEN_ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(ivValue, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export async function syncPlaidTransactions({
  accessToken,
  cursor,
}: {
  accessToken: string;
  cursor?: string | null;
}) {
  let nextCursor = cursor ?? null;
  let hasMore = true;
  const added: Array<Record<string, unknown>> = [];
  const modified: Array<Record<string, unknown>> = [];
  const removed: Array<Record<string, unknown>> = [];
  const accountsById = new Map<string, Record<string, unknown>>();
  let transactionsUpdateStatus: string | undefined;

  while (hasMore) {
    const result = await plaidPost<PlaidTransactionsSyncResponse>(
      "/transactions/sync",
      {
        access_token: accessToken,
        cursor: nextCursor,
        count: 100,
        options: {
          include_original_description: true,
        },
      },
      "Could not fetch Plaid transactions.",
    );

    if ("error" in result) {
      return { error: result.error, status: result.status };
    }

    const page = result.data;
    added.push(...page.added);
    modified.push(...page.modified);
    removed.push(...page.removed);
    for (const account of page.accounts) {
      const accountId = account.account_id;
      if (typeof accountId === "string") {
        accountsById.set(accountId, account);
      }
    }
    transactionsUpdateStatus = page.transactions_update_status;
    nextCursor = page.next_cursor;
    hasMore = page.has_more;
  }

  return {
    added,
    modified,
    removed,
    accounts: Array.from(accountsById.values()),
    nextCursor,
    transactionsUpdateStatus,
  };
}
