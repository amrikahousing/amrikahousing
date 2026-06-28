/**
 * Shared constants for Privacy Policy / Terms of Service acceptance.
 *
 * `CURRENT_POLICY_VERSION` is bumped whenever the policy materially changes so
 * acceptance records remain tied to the version the user actually agreed to.
 * It mirrors the "Effective Date" of the published policy document.
 *
 * Each version is published as an IMMUTABLE, version-named static file under
 * /public/legal (never edit a published file — add a new version instead).
 * `CURRENT_POLICY_HASH` is the SHA-256 of that exact file's bytes, recorded on
 * every acceptance so we can later prove the precise text a user agreed to.
 *
 * When publishing a new version:
 *   1. Drop the new file at /public/legal/privacy-policy-<version>.html
 *   2. Run: shasum -a 256 public/legal/privacy-policy-<version>.html
 *   3. Update CURRENT_POLICY_VERSION, CURRENT_POLICY_HASH, and the URL below.
 *   (existing users are then re-prompted automatically on next sign-in.)
 */
export const POLICY_KEY = "privacy_and_terms";
export const CURRENT_POLICY_VERSION = "2026-04-21";

// SHA-256 of public/legal/privacy-policy-2026-04-21.html (the served bytes).
export const CURRENT_POLICY_HASH =
  "4569b8204b31c6724ae843cbe4fb37d89d145f19298585c5fcc3fe6112e0b1ab";

// Immutable, version-named legal documents served from /public/legal.
export const PRIVACY_POLICY_URL = "/legal/privacy-policy-2026-04-21.html";
// No standalone Terms doc has been provided yet; the terms are incorporated by
// reference into the Privacy Policy, so both links point there for now.
export const TERMS_OF_SERVICE_URL = "/legal/privacy-policy-2026-04-21.html";
