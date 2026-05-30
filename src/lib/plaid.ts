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

type PlaidAuthGetResponse = {
  accounts?: Array<Record<string, unknown>>;
  request_id: string;
};

type PlaidStripeBankAccountTokenCreateResponse = {
  stripe_bank_account_token: string;
  request_id: string;
};

type PlaidWebhookVerificationKeyGetResponse = {
  key: crypto.JsonWebKey & {
    alg?: string;
    created_at?: number;
    expired_at?: number | null;
    kid?: string;
  };
  request_id: string;
};

const PLAID_STRIPE_INTEGRATION_NOT_ENABLED_MESSAGE =
  "Plaid's Stripe integration is not enabled for this Plaid app yet. Enable Stripe in the Plaid Dashboard integrations, then reconnect the bank account and try again.";

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

function isPlaidStripeIntegrationNotEnabledError(error: string) {
  const normalizedError = error.toLowerCase();
  return (
    normalizedError.includes("api keys are not enabled") &&
    normalizedError.includes("stripe")
  );
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

const plaidWebhookKeyCache = new Map<string, PlaidWebhookVerificationKeyGetResponse["key"]>();

function base64UrlToBuffer(value: string) {
  return Buffer.from(value.replaceAll("-", "+").replaceAll("_", "/"), "base64");
}

function decodeJwtPart(value: string) {
  return JSON.parse(base64UrlToBuffer(value).toString("utf8")) as Record<string, unknown>;
}

function timingSafeEqualString(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function getPlaidWebhookVerificationKey(
  keyId: string,
): Promise<
  | { key: PlaidWebhookVerificationKeyGetResponse["key"] }
  | { error: string; status: number }
> {
  const cachedKey = plaidWebhookKeyCache.get(keyId);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (cachedKey && (!cachedKey.expired_at || cachedKey.expired_at > nowSeconds)) {
    return { key: cachedKey };
  }

  const result = await plaidPost<PlaidWebhookVerificationKeyGetResponse>(
    "/webhook_verification_key/get",
    { key_id: keyId },
    "Could not fetch Plaid webhook verification key.",
  );
  if ("error" in result) {
    return {
      error: result.error ?? "Could not fetch Plaid webhook verification key.",
      status: result.status ?? 500,
    };
  }

  plaidWebhookKeyCache.set(keyId, result.data.key);
  return { key: result.data.key };
}

export async function verifyPlaidWebhookRequest(rawBody: string, verificationJwt: string | null) {
  if (!verificationJwt) return false;

  const jwtParts = verificationJwt.split(".");
  if (jwtParts.length !== 3) return false;

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = decodeJwtPart(jwtParts[0]);
    payload = decodeJwtPart(jwtParts[1]);
  } catch {
    return false;
  }

  if (header.alg !== "ES256" || typeof header.kid !== "string") return false;

  const keyResult = await getPlaidWebhookVerificationKey(header.kid);
  if ("error" in keyResult) return false;

  const publicKey = crypto.createPublicKey({ key: keyResult.key, format: "jwk" });
  const signatureIsValid = crypto.verify(
    "sha256",
    Buffer.from(`${jwtParts[0]}.${jwtParts[1]}`),
    { key: publicKey, dsaEncoding: "ieee-p1363" },
    base64UrlToBuffer(jwtParts[2]),
  );
  if (!signatureIsValid) return false;

  const issuedAt = typeof payload.iat === "number" ? payload.iat : null;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!issuedAt || nowSeconds - issuedAt > 5 * 60 || issuedAt - nowSeconds > 60) return false;

  if (typeof payload.request_body_sha256 !== "string") return false;
  const bodyHash = crypto.createHash("sha256").update(rawBody, "utf8").digest("hex");
  return timingSafeEqualString(bodyHash, payload.request_body_sha256);
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
      products: ["transactions", "auth"],
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

export async function createPlaidAuthUpdateLinkToken({
  userId,
  clientName,
  accessToken,
}: {
  userId: string;
  clientName: string;
  accessToken: string;
}) {
  const result = await plaidPost<PlaidLinkTokenResponse>(
    "/link/token/create",
    {
      client_name: clientName,
      country_codes: ["US"],
      language: "en",
      access_token: accessToken,
      additional_consented_products: ["auth"],
      user: {
        client_user_id: userId,
      },
    },
    "Could not create Plaid update link token.",
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

export async function getPlaidAuthAccounts({
  accessToken,
}: {
  accessToken: string;
}) {
  const result = await plaidPost<PlaidAuthGetResponse>(
    "/auth/get",
    {
      access_token: accessToken,
    },
    "Could not fetch Plaid Auth data.",
  );

  if ("error" in result) return { error: result.error, status: result.status };

  return {
    accounts: result.data.accounts ?? [],
  };
}

export async function createPlaidStripeBankAccountToken(args: {
  accessToken: string;
  accountId: string;
}) {
  const result = await plaidPost<PlaidStripeBankAccountTokenCreateResponse>(
    "/processor/stripe/bank_account_token/create",
    {
      access_token: args.accessToken,
      account_id: args.accountId,
    },
    "Could not create the Stripe payout token for this Plaid account.",
  );

  if ("error" in result) {
    const errorMessage =
      result.error ?? "Could not create the Stripe payout token for this Plaid account.";

    return {
      error: isPlaidStripeIntegrationNotEnabledError(errorMessage)
        ? PLAID_STRIPE_INTEGRATION_NOT_ENABLED_MESSAGE
        : errorMessage,
      status: result.status,
    };
  }

  return {
    bankAccountToken: result.data.stripe_bank_account_token,
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
