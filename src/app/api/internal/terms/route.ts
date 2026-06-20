import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import {
  CURRENT_POLICY_HASH,
  CURRENT_POLICY_VERSION,
  POLICY_KEY,
} from "@/lib/policy";

/**
 * Returns whether the signed-in user has on record an acceptance of the
 * current Privacy Policy / Terms of Service. Used by the login flow to decide
 * whether an existing user still needs to be prompted to accept.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ signedIn: false, accepted: false }, { status: 401 });
  }

  const record = await prisma.policy_acceptances.findUnique({
    where: { clerk_user_id_policy: { clerk_user_id: userId, policy: POLICY_KEY } },
    select: { version: true, accepted_at: true },
  });

  const accepted = record != null && record.version === CURRENT_POLICY_VERSION;

  return Response.json({
    signedIn: true,
    accepted,
    version: record?.version ?? null,
    acceptedAt: record?.accepted_at ?? null,
    currentVersion: CURRENT_POLICY_VERSION,
  });
}

/**
 * Records the signed-in user's acceptance of the current policy version.
 * Idempotent per (user, policy): re-accepting refreshes the timestamp/version.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ signedIn: false, accepted: false }, { status: 401 });
  }

  const user = await currentUser().catch(() => null);
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0]?.trim() || null : null;
  const userAgent = req.headers.get("user-agent");

  await prisma.policy_acceptances.upsert({
    where: { clerk_user_id_policy: { clerk_user_id: userId, policy: POLICY_KEY } },
    create: {
      clerk_user_id: userId,
      policy: POLICY_KEY,
      version: CURRENT_POLICY_VERSION,
      content_hash: CURRENT_POLICY_HASH,
      email,
      ip,
      user_agent: userAgent,
    },
    update: {
      version: CURRENT_POLICY_VERSION,
      content_hash: CURRENT_POLICY_HASH,
      accepted_at: new Date(),
      email,
      ip,
      user_agent: userAgent,
    },
  });

  return Response.json({ accepted: true, version: CURRENT_POLICY_VERSION });
}
