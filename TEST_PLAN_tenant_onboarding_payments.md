# Test Plan — Tenant Onboarding, Payment Plan Setup & Payment System

**Scope:** Verify a tenant can be onboarded end-to-end, that a rent payment plan (schedule) is generated correctly, and that the full payment system works — adding a payment method, manual payment, autopay, webhooks, and Stripe Connect fund routing.

**Environment:** Stripe **test mode** (`sk_test_…` / `pk_test_…`), local Inngest dev (`INNGEST_DEV=1`), Neon DB. Use the `neon-preview-test` branch.

---

## 0. Pre-flight / environment checks

| # | Check | How | Pass criteria |
|---|-------|-----|---------------|
| 0.1 | Stripe configured | Confirm `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` set with **test** keys | `isStripeConfigured()` returns true; all keys are `*_test_*` |
| 0.2 | Webhook listener running | `stripe listen --forward-to localhost:3000/api/webhooks/stripe` | CLI prints a `whsec_…`; matches `STRIPE_WEBHOOK_SECRET` |
| 0.3 | Inngest dev running | `npx inngest-cli dev` (or app dev server) | Autopay function `renter/autopay.run` visible |
| 0.4 | Org has Stripe Connect | Org `stripe_account_id` set, `stripe_charges_enabled = true` | Otherwise payments can't route — set up Connect first (test express account) |
| 0.5 | App running | `npm run dev` | Login + `/renter` reachable |

> **Connect note:** Without an onboarded connected account (`account.updated` → `stripe_charges_enabled = true`), PaymentIntents with `transfer_data` will fail. Do Connect onboarding (test mode auto-fills) before payment tests.

---

## Part A — Tenant Onboarding

### A1. Invite a standalone tenant (no lease) — new user
- **Endpoint:** `POST /api/renters/invite`
- **Steps:** As a property manager, invite `tenant-new@test.com` (first/last name, propertyId).
- **Expect:**
  - `201` with `{ invited: "tenant-new@test.com" }`
  - Row in `tenants` (unique on `organization_id + email`)
  - Clerk invitation sent with `publicMetadata.role = "renter"`, redirect `/login?renter=1`

### A2. Invite a tenant who already has a Clerk account
- **Steps:** Invite an email that already exists in Clerk.
- **Expect:** `201` with `{ linked: <email> }` (no invite email), `tenants.clerk_user_id` populated, `users` row role `renter`.

### A3. Duplicate invite (same org, same email)
- **Steps:** Re-run A1 with same email.
- **Expect:** Upsert — **no duplicate** tenant row; record updated.

### A4. Full onboarding with uploaded lease
- **Endpoint:** `POST /api/renters/onboard` (lease file upload mode)
- **Inputs:** email, names, propertyId, unitId, `start_date`, `end_date`, `rent_amount` (e.g. 1500.00).
- **Expect:**
  - `201` with `tenantId`, `leaseId`
  - `leases` row status `active`, lease file in Blob storage
  - `lease_tenants` row `is_primary = true`
  - **Unit status → `occupied`**
  - **Payment schedule created** (see B1)

### A5. Full onboarding with e-sign lease + co-tenants
- **Endpoint:** `POST /api/renters/onboard` (e-sign mode)
- **Expect:**
  - `leases` status `pending_signature`; `lease_signature_requests` row + `docusealSubmissionId`
  - Co-tenants created with `is_primary = false`
  - Clerk invites sent to tenants without accounts
  - **No payment schedule yet** — created on signature (B2)

### A6. Tenant account activation (manual / E2E)
- **Steps:** Open invite link (`__clerk_ticket`), set password, verify 6-digit code, land on `/renter`.
- **Expect:** `whoami` resolves role `renter`; dashboard shows lease + payments.

### A7. Validation / negative cases
| Case | Expect |
|------|--------|
| Bad email format | `422` validation error |
| Invalid/unauthorized propertyId | `403`/`404` |
| Missing required fields | `422` |
| `end_date` ≤ `start_date` | rejected |
| Clerk invite fails | `207` partial success, tenant still created |

---

## Part B — Payment Plan (Rent Schedule) Setup

### B1. Schedule generated on uploaded-lease onboard
- **After A4**, query `payments` for `lease_id`.
- **Expect:** One `payments` row per month from `start_date` to `end_date` (inclusive), each:
  - `type = "rent"`, `status = "pending"`, `currency = "USD"`
  - `amount = rent_amount`, `due_date` = 1st of each month
  - Open-ended lease → 12 rows generated (`buildRentPaymentDueDates`)

### B2. Schedule generated on lease signature
- **After A5**, complete DocuSeal signature → `activateLeaseAfterSignature()`.
- **Expect:** Lease → `active`; payment schedule now created; **no duplicates** (`existingPaymentCount === 0` guard).

### B3. Rent credit applied
- **Setup:** Lease with `monthly_rent_credit` (e.g. 100.00).
- **Expect:** `computeNetRent()` — credit applied **from month 2 onward**, month 1 full rent. Verify net amounts per month.

### B4. Idempotency / no double schedule
- **Steps:** Re-trigger onboarding/activation for same lease.
- **Expect:** No additional `payments` rows.

---

## Part C — Payment System (the core)

### C1. Add a card payment method
- **Endpoints:** `POST /api/renter/payments/setup-intent` → confirm with Stripe Elements → `POST /api/renter/payments/setup-intent/complete`
- **Test card:** `4242 4242 4242 4242`, any future expiry, any CVC.
- **Expect:**
  - SetupIntent `off_session` succeeds; webhook `setup_intent.succeeded` fires
  - `renter_payment_methods` row: `payment_type = card`, brand `visa`, `last4 = 4242`, `is_default = true` (first method)
  - `renter_payment_settings` has `stripe_customer_id`

### C2. Add an ACH (bank) payment method
- **Test:** `us_bank_account` test routing/account (e.g. routing `110000000`, acct `000123456789`).
- **Expect:** `renter_payment_methods` row `payment_type = us_bank_account` with bank name/last4.

### C3. Manual rent payment — card success
- **Endpoint:** `POST /api/renter/payments/intent` with `{ paymentId, paymentMethodId, amount }`
- **Expect:**
  - PaymentIntent `confirm: true, off_session: false`, `transfer_data` → org connected account
  - `payment_attempts` row: provider `stripe`, status `succeeded`, amount = rent + processing fee (**2.9% + $0.30**)
  - Webhook `payment_intent.succeeded` → `payments.status = "paid"`, `paid_at` set, `reference = pi_…`, `payment_method` label set

### C4. Manual payment — ACH fee check
- **Steps:** Pay with bank account.
- **Expect:** Processing fee = **0.8%, capped at $5.00**; rent transferred to org, fee retained by Stripe.

### C5. Manual payment — card declined
- **Test card:** `4000 0000 0000 0002` (generic decline).
- **Expect:** Webhook `payment_intent.payment_failed` → `payment_attempts.status = failed`, `failure_code`/`failure_message` populated; `payments.status` stays `pending`.

### C6. Manual payment — authentication required (3DS)
- **Test card:** `4000 0025 0000 3155`.
- **Expect:** `clientSecret` returned for frontend confirmation; on completion payment succeeds; on abandonment stays pending.

### C7. Idempotency — double-submit
- **Steps:** Fire `/intent` twice for same payment quickly.
- **Expect:** Same idempotency key `{paymentId}:{methodId}:stripe` → **single** charge, not two.

### C8. Set default payment method
- **Endpoint:** `POST /api/renter/payments/default-method`
- **Expect:** `is_default` moves to chosen method; future pending payments' `payment_method` label updated.

### C9. Remove payment method
- **Endpoint:** `DELETE /api/renter/payments/methods/[id]`
- **Expect:** Stripe `paymentMethods.detach`; row soft-deleted (`deleted_at`); excluded from autopay.

---

## Part D — Autopay (recurring)

### D1. Enable autopay
- **Endpoint:** `POST /api/renter/payments/autopay`
- **Expect:** `renter_payment_settings.autopay_enabled = true` with a valid default method.

### D2. Autopay charges a due payment
- **Trigger:** Inngest `renter/autopay.run` (manual) or cron `0 8 * * *`.
- **Setup:** A `payments` row with `due_date` ≤ today, status `pending`, tenant autopay on.
- **Expect:**
  - `getAutopayChargesDue()` selects it
  - PaymentIntent `confirm: true, off_session: true`, idempotency `{paymentId}:{methodId}:autopay:{YYYY-MM-DD}`
  - Webhook → `payments.status = "paid"`

### D3. Autopay same-day rerun safety
- **Steps:** Run autopay batch twice same day.
- **Expect:** Day-scoped idempotency key prevents double charge.

### D4. Autopay off-session failure handling
- **Test card:** `4000 0000 0000 9995` (insufficient funds) as default method.
- **Expect:** Failure recorded in `payment_attempts`; **batch continues** for other tenants (no abort); retried daily; gives up after **4** failed attempts.

### D5. Autopay skips ineligible
- **Expect:** Tenants without autopay, without active method, or with soft-deleted method are skipped.

---

## Part E — Webhooks & Connect

| # | Event | Trigger | Expect |
|---|-------|---------|--------|
| E1 | `account.updated` | Complete Connect onboarding | `organizations.stripe_charges_enabled`/`stripe_payouts_enabled` synced |
| E2 | `setup_intent.succeeded` | C1/C2 | Method synced via `syncPaymentMethodFromStripe()` |
| E3 | `payment_intent.succeeded` | C3/D2 | Payment marked paid |
| E4 | `payment_intent.payment_failed` | C5/D4 | Attempt failure recorded |
| E5 | Bad signature | Send unsigned payload | `400`, event rejected (`constructEvent` throws) |

---

## Test data reference (Stripe test mode)

| Purpose | Card / value |
|---------|--------------|
| Success | `4242 4242 4242 4242` |
| Generic decline | `4000 0000 0000 0002` |
| Insufficient funds | `4000 0000 0000 9995` |
| 3DS required | `4000 0025 0000 3155` |
| ACH test | routing `110000000`, acct `000123456789` |

---

## Execution checklist (smoke happy-path, in order)
1. [ ] 0.1–0.5 pre-flight green
2. [ ] A4 onboard tenant w/ uploaded lease (rent 1500)
3. [ ] B1 verify 12-month schedule of pending $1500 payments
4. [ ] A6 activate tenant account → `/renter`
5. [ ] C1 add card `4242…` → default method stored
6. [ ] C3 pay this month's rent → `payments.status = paid`, fee correct, funds routed to org
7. [ ] D1 enable autopay
8. [ ] D2 trigger autopay for next due → paid
9. [ ] E3/E4 confirm webhook status transitions in DB

**Full pass = onboarding → schedule → method → manual pay → autopay → webhooks all verified in test mode.**

---

## Key files under test
| Area | File |
|------|------|
| Invite | `src/app/api/renters/invite/route.ts` |
| Onboard + schedule | `src/app/api/renters/onboard/route.ts` |
| Schedule calc | `src/lib/lease-payments.ts` (`buildRentPaymentDueDates`) |
| Rent credit | `src/lib/rent-credit.ts` (`computeNetRent`) |
| Payment logic | `src/lib/renter-payments.ts` |
| Stripe client | `src/lib/stripe.ts` |
| Connect setup | `src/lib/organization-payment-destinations.ts` |
| Webhooks | `src/app/api/webhooks/stripe/route.ts` |
| Autopay job | `src/inngest/autopay.ts` |
| Lease activation | `src/lib/lease-signatures.ts` (`activateLeaseAfterSignature`) |
