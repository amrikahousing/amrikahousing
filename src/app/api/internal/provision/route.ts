import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const secret = process.env.INTERNAL_SECRET;

  if (!secret) {
    return Response.json(
      { error: "Provisioning is not configured on this environment." },
      { status: 503 }
    );
  }

  const token = request.headers.get("x-internal-token");
  if (!token || token !== secret) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { orgName?: string; adminEmail?: string; appUrl?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const orgName = body.orgName?.trim();
  const adminEmail = body.adminEmail?.trim().toLowerCase();
  const appUrl = body.appUrl?.trim() || "https://amrikahousing.com";

  if (!orgName) {
    return Response.json({ error: "orgName is required." }, { status: 422 });
  }
  if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    return Response.json(
      { error: "A valid adminEmail is required." },
      { status: 422 }
    );
  }

  const clerk = await clerkClient();

  const org = await clerk.organizations.createOrganization({ name: orgName });

  const invitation = await clerk.organizations.createOrganizationInvitation({
    organizationId: org.id,
    emailAddress: adminEmail,
    role: "org:admin",
    redirectUrl: `${appUrl}/onboarding`,
  });

  return Response.json({
    orgId: org.id,
    orgName: org.name,
    invitationId: invitation.id,
    invitedEmail: adminEmail,
    status: invitation.status,
  });
}
