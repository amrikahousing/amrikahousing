import { auth, currentUser } from "@clerk/nextjs/server";

type ClerkMetadata = Record<string, unknown>;

export async function requireInternalAdmin() {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    redirectToSignIn({ returnBackUrl: "/internal/provision" });
  }

  const user = await currentUser();
  const privateMetadata = (user?.privateMetadata ?? {}) as ClerkMetadata;

  if (privateMetadata.internalAdmin !== true) {
    return { error: "Not found", status: 404 } as const;
  }

  return { userId } as const;
}

export async function isInternalAdmin() {
  const { userId } = await auth();

  if (!userId) return false;

  const user = await currentUser();
  const privateMetadata = (user?.privateMetadata ?? {}) as ClerkMetadata;

  return privateMetadata.internalAdmin === true;
}
