import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/signup(.*)",
  "/internal(.*)",
  "/onboard(.*)",
]);

// Routes that require an active org (not just authentication)
const isSignupRoute = createRouteMatcher(["/signup(.*)"]);

const isOrgRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/properties(.*)",
  "/import(.*)",
  "/api/import(.*)",
  "/api/properties(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (isSignupRoute(request) && !request.nextUrl.searchParams.has("__clerk_ticket")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isPublicRoute(request)) return;

  const { userId, orgId } = await auth.protect();

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
