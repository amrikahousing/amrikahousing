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

export type PlaidLinkSuccessMetadata = {
  institution?: {
    institution_id?: string | null;
    name?: string | null;
    logo?: string | null;
  } | null;
};

type PlaidInstitutionResponse = {
  institution?: {
    institution_id?: string;
    name?: string;
    logo?: string | null;
  };
  request_id: string;
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

export async function createPlaidLinkToken({
  userId,
  clientName,
}: {
  userId: string;
  clientName: string;
}) {
  const config = getPlaidConfig();
  if ("error" in config) return { error: config.error, status: 501 };

  const response = await fetch(`${config.baseUrl}/link/token/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      secret: config.secret,
      client_name: clientName,
      country_codes: ["US"],
      language: "en",
      products: ["transactions"],
      user: {
        client_user_id: userId,
      },
    }),
  });
  const body = (await response.json()) as PlaidLinkTokenResponse & PlaidErrorResponse;

  if (!response.ok) {
    return {
      error: plaidErrorMessage(body, "Could not create Plaid link token."),
      status: response.status,
    };
  }

  return { linkToken: body.link_token, expiration: body.expiration };
}

export async function exchangePlaidPublicToken(publicToken: string) {
  const config = getPlaidConfig();
  if ("error" in config) return { error: config.error, status: 501 };

  const response = await fetch(`${config.baseUrl}/item/public_token/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      secret: config.secret,
      public_token: publicToken,
    }),
  });
  const body = (await response.json()) as PlaidExchangeResponse & PlaidErrorResponse;

  if (!response.ok) {
    return {
      error: plaidErrorMessage(body, "Could not connect this Plaid account."),
      status: response.status,
    };
  }

  return {
    accessToken: body.access_token,
    itemId: body.item_id,
  };
}

export async function getPlaidInstitution({
  institutionId,
}: {
  institutionId: string;
}) {
  const config = getPlaidConfig();
  if ("error" in config) return { error: config.error, status: 501 };

  const response = await fetch(`${config.baseUrl}/institutions/get_by_id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      secret: config.secret,
      institution_id: institutionId,
      country_codes: ["US"],
      options: {
        include_optional_metadata: true,
      },
    }),
  });
  const body = (await response.json()) as PlaidInstitutionResponse & PlaidErrorResponse;

  if (!response.ok) {
    return {
      error: plaidErrorMessage(body, "Could not fetch Plaid institution."),
      status: response.status,
    };
  }

  return { institution: body.institution ?? null };
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
  const config = getPlaidConfig();
  if ("error" in config) return { error: config.error, status: 501 };

  let nextCursor = cursor ?? null;
  let hasMore = true;
  const added: Array<Record<string, unknown>> = [];
  const modified: Array<Record<string, unknown>> = [];
  const removed: Array<Record<string, unknown>> = [];
  const accountsById = new Map<string, Record<string, unknown>>();
  let transactionsUpdateStatus: string | undefined;

  while (hasMore) {
    const response = await fetch(`${config.baseUrl}/transactions/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: config.clientId,
        secret: config.secret,
        access_token: accessToken,
        cursor: nextCursor,
        count: 100,
        options: {
          include_original_description: true,
        },
      }),
    });
    const body = (await response.json()) as
      | PlaidTransactionsSyncResponse
      | PlaidErrorResponse;

    if (!response.ok) {
      return {
        error: plaidErrorMessage(body, "Could not fetch Plaid transactions."),
        status: response.status,
      };
    }

    const page = body as PlaidTransactionsSyncResponse;
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
