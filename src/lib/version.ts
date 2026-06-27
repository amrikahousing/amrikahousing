// Single source of truth for the user-facing app version.
// Bump this on each release; it is surfaced in the sidebar footer.
// Prefer NEXT_PUBLIC_APP_VERSION (e.g. injected from CI / the deploy) when set.
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";
