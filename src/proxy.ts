import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/signup(.*)",
  "/onboard(.*)",
]);

// Routes that require an active org (not just authentication)
const isSignupRoute = createRouteMatcher(["/signup(.*)"]);
const isLegacyOnboardingRoute = createRouteMatcher(["/onboarding(.*)"]);

const isOrgRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/accounts(.*)",
  "/properties(.*)",
  "/team(.*)",
  "/api/accounting(.*)",
  "/api/plaid(.*)",
  "/api/properties(.*)",
  "/api/property-managers(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (isLegacyOnboardingRoute(request) && request.nextUrl.searchParams.has("__clerk_ticket")) {
    const signup = new URL("/signup", request.url);
    request.nextUrl.searchParams.forEach((value, key) => {
      signup.searchParams.set(key, value);
    });
    return NextResponse.redirect(signup);
  }

  if (isLegacyOnboardingRoute(request)) {
    const onboard = new URL("/onboard", request.url);
    request.nextUrl.searchParams.forEach((value, key) => {
      onboard.searchParams.set(key, value);
    });
    return NextResponse.redirect(onboard);
  }

  if (isSignupRoute(request) && !request.nextUrl.searchParams.has("__clerk_ticket")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isPublicRoute(request)) return;

  const { orgId } = await auth.protect();

  // Authenticated but no active org — redirect to onboard
  if (isOrgRoute(request) && !orgId) {
    const onboard = new URL("/onboard", request.url);
    return NextResponse.redirect(onboard);
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
