CREATE TABLE "policy_acceptances" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "clerk_user_id" text NOT NULL,
    "email" text,
    "policy" text NOT NULL DEFAULT 'privacy_and_terms',
    "version" text,
    "content_hash" text,
    "accepted_at" timestamptz(6) NOT NULL DEFAULT now(),
    "ip" text,
    "user_agent" text
);

CREATE UNIQUE INDEX "policy_acceptances_user_policy_unique" ON "policy_acceptances"("clerk_user_id", "policy");
CREATE INDEX "idx_policy_acceptances_clerk" ON "policy_acceptances"("clerk_user_id");
