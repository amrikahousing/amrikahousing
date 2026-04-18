import { auth, currentUser } from "@clerk/nextjs/server";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ signedIn: false }, { status: 401 });
  }

  const user = await currentUser();
  const privateMetadata = (user?.privateMetadata ?? {}) as Record<string, unknown>;

  return Response.json({
    signedIn: true,
    userId,
    email: user?.primaryEmailAddress?.emailAddress ?? null,
    internalAdmin: privateMetadata.internalAdmin === true,
    internalAdminType: typeof privateMetadata.internalAdmin,
  });
}
