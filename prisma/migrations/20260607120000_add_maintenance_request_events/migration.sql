CREATE TABLE "maintenance_request_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "maintenance_request_id" uuid NOT NULL,
  "action" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text,
  "actor_name" text,
  "from_status" text,
  "to_status" text,
  "note" text,
  "metadata" jsonb,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "maintenance_request_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "maintenance_request_events_request_fkey"
    FOREIGN KEY ("maintenance_request_id")
    REFERENCES "maintenance_requests"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION,
  CONSTRAINT "maintenance_request_events_org_fkey"
    FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION
);

CREATE INDEX "idx_maintenance_request_events_request" ON "maintenance_request_events"("maintenance_request_id");
CREATE INDEX "idx_maintenance_request_events_org" ON "maintenance_request_events"("organization_id");
CREATE INDEX "idx_maintenance_request_events_action" ON "maintenance_request_events"("action");
