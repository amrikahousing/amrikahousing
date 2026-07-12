// Fake Clerk identity for integration specs. Test files register this module
// as the implementation of "@clerk/nextjs/server" via
//   vi.mock("@clerk/nextjs/server", async () => (await import("./clerk-mock")).clerkServerMock());
// then flip the signed-in user with signInAsOrgAdmin()/signOut() per test.
// Only the process boundary is faked — org/user sync, permissions, and every
// database query still run for real.

type Identity = {
  userId: string | null;
  orgId: string | null;
  orgRole: string | null;
  email: string;
  firstName: string;
  lastName: string;
};

const identity: Identity = {
  userId: null,
  orgId: null,
  orgRole: null,
  email: "",
  firstName: "",
  lastName: "",
};

export function signInAsOrgAdmin(user: {
  clerkUserId: string;
  clerkOrgId: string;
  email: string;
  firstName: string;
  lastName: string;
}) {
  identity.userId = user.clerkUserId;
  identity.orgId = user.clerkOrgId;
  identity.orgRole = "org:admin";
  identity.email = user.email;
  identity.firstName = user.firstName;
  identity.lastName = user.lastName;
}

export function signOut() {
  identity.userId = null;
  identity.orgId = null;
  identity.orgRole = null;
}

export function clerkServerMock() {
  return {
    auth: async () => ({
      userId: identity.userId,
      orgId: identity.orgId,
      orgRole: identity.orgRole,
    }),
    currentUser: async () =>
      identity.userId
        ? {
            id: identity.userId,
            firstName: identity.firstName,
            lastName: identity.lastName,
            primaryEmailAddress: { emailAddress: identity.email },
            primaryPhoneNumber: null,
            unsafeMetadata: {},
            publicMetadata: {},
          }
        : null,
    clerkClient: async () => ({
      organizations: {
        getOrganization: async () => ({ name: "Integration Test Org" }),
      },
    }),
  };
}
