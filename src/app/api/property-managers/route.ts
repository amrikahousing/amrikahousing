import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";

type InviteManagersBody = {
  emails?: unknown;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmails(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((email): email is string => typeof email === "string")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export async function POST(request: NextRequest) {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!orgId) {
    return Response.json(
      { error: "No active organization. Please join or create an organization." },
      { status: 403 },
    );
  }

  if (orgRole !== "org:admin") {
    return Response.json(
      { error: "Only organization admins can add property managers." },
      { status: 403 },
    );
  }

  let body: InviteManagersBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const emails = normalizeEmails(body.emails);
  if (!emails.length) {
    return Response.json(
      { error: "Enter at least one property manager email." },
      { status: 422 },
    );
  }

  const invalidEmails = emails.filter((email) => !EMAIL_PATTERN.test(email));
  if (invalidEmails.length) {
    return Response.json(
      { error: `Invalid email: ${invalidEmails.join(", ")}` },
      { status: 422 },
    );
  }

  const clerk = await clerkClient();
  const redirectUrl = new URL("/signup", request.nextUrl.origin).toString();
  const invited: string[] = [];
  const failed: string[] = [];

  for (const emailAddress of emails) {
    try {
      await clerk.organizations.createOrganizationInvitation({
        organizationId: orgId,
        emailAddress,
        role: "org:member",
        redirectUrl,
      });
      invited.push(emailAddress);
    } catch {
      failed.push(emailAddress);
    }
  }

  if (failed.length) {
    return Response.json(
      {
        error: `Could not invite: ${failed.join(", ")}.`,
        invited,
        failed,
      },
      { status: invited.length ? 207 : 400 },
    );
  }

  return Response.json({ invited });
}
