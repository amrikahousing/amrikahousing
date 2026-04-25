-- Create tenant_profiles: global renter identity, one row per email/Clerk user
CREATE TABLE renter.tenant_profiles (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT        UNIQUE,
  email         TEXT        NOT NULL UNIQUE,
  first_name    TEXT        NOT NULL,
  last_name     TEXT        NOT NULL,
  phone         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_tenant_profiles_clerk ON renter.tenant_profiles(clerk_user_id);

-- Backfill one profile per distinct email from existing tenants.
-- When multiple orgs share the same email, prefer the row that already has a clerk_user_id.
INSERT INTO renter.tenant_profiles (id, clerk_user_id, email, first_name, last_name, phone, created_at, updated_at, deleted_at)
SELECT DISTINCT ON (email)
  gen_random_uuid(),
  clerk_user_id,
  email,
  first_name,
  last_name,
  phone,
  created_at,
  updated_at,
  deleted_at
FROM renter.tenants
ORDER BY email, clerk_user_id NULLS LAST, created_at ASC;

-- Add the FK column to tenants
ALTER TABLE renter.tenants ADD COLUMN tenant_profile_id UUID;

-- Link each tenants row to its profile via matching email
UPDATE renter.tenants t
SET tenant_profile_id = p.id
FROM renter.tenant_profiles p
WHERE t.email = p.email;

-- Make it NOT NULL now that every row is linked
ALTER TABLE renter.tenants ALTER COLUMN tenant_profile_id SET NOT NULL;

-- FK constraint + composite unique (one tenancy per org per profile)
ALTER TABLE renter.tenants
  ADD CONSTRAINT tenants_tenant_profile_id_fkey
    FOREIGN KEY (tenant_profile_id) REFERENCES renter.tenant_profiles(id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT tenants_org_profile_unique
    UNIQUE (organization_id, tenant_profile_id);

CREATE INDEX idx_tenants_profile ON renter.tenants(tenant_profile_id);

-- Drop old identity columns and constraints from tenants
ALTER TABLE renter.tenants DROP CONSTRAINT IF EXISTS tenants_clerk_user_id_key;
ALTER TABLE renter.tenants DROP CONSTRAINT IF EXISTS tenants_email_org_unique;
DROP INDEX IF EXISTS renter.idx_tenants_clerk;

ALTER TABLE renter.tenants
  DROP COLUMN IF EXISTS clerk_user_id,
  DROP COLUMN IF EXISTS first_name,
  DROP COLUMN IF EXISTS last_name,
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS email;

-- Grants for new table
GRANT ALL PRIVILEGES ON TABLE renter.tenant_profiles TO PUBLIC;
