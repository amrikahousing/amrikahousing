import { auth, currentUser } from "@clerk/nextjs/server";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ signedIn: false }, { status: 401 });
  }

  const user = await currentUser();
  const privateMetadata = (user?.privateMetadata ?? {}) as Record<string, unknown>;

  const unsafeMetadata = (user?.unsafeMetadata ?? {}) as Record<string, unknown>;
  const publicMetadata = (user?.publicMetadata ?? {}) as Record<string, unknown>;
  const role =
    (typeof unsafeMetadata.role === "string" && unsafeMetadata.role.trim()
      ? unsafeMetadata.role
      : null) ??
    (typeof publicMetadata.role === "string" && publicMetadata.role.trim()
      ? publicMetadata.role
      : null) ??
    "property_manager";

  return Response.json({
    signedIn: true,
    userId,
    email: user?.primaryEmailAddress?.emailAddress ?? null,
    role,
    internalAdmin: privateMetadata.internalAdmin === true,
    internalAdminType: typeof privateMetadata.internalAdmin,
  });
}
