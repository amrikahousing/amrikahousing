CREATE TABLE "notifications_sent" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "tenant_id" uuid,
  "channel" text NOT NULL DEFAULT 'sms',
  "recipient_type" text,
  "to_phone" text NOT NULL,
  "body" text NOT NULL,
  "provider_sid" text,
  "status" text NOT NULL DEFAULT 'queued',
  "related_type" text,
  "related_id" uuid,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "notifications_sent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_notifications_sent_provider_sid" ON "notifications_sent" ("provider_sid");
CREATE INDEX "idx_notifications_sent_related" ON "notifications_sent" ("related_type", "related_id");
CREATE INDEX "idx_notifications_sent_org" ON "notifications_sent" ("organization_id");
