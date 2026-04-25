-- Re-add identity columns back to tenants
ALTER TABLE renter.tenants
  ADD COLUMN clerk_user_id TEXT,
  ADD COLUMN first_name    TEXT,
  ADD COLUMN last_name     TEXT,
  ADD COLUMN phone         TEXT,
  ADD COLUMN email         TEXT;

-- Backfill from tenant_profiles
UPDATE renter.tenants t
SET
  clerk_user_id = p.clerk_user_id,
  first_name    = p.first_name,
  last_name     = p.last_name,
  phone         = p.phone,
  email         = p.email
FROM renter.tenant_profiles p
WHERE t.tenant_profile_id = p.id;

-- Make required columns NOT NULL
ALTER TABLE renter.tenants
  ALTER COLUMN first_name SET NOT NULL,
  ALTER COLUMN last_name  SET NOT NULL,
  ALTER COLUMN email      SET NOT NULL;

-- Restore old unique constraints and index
ALTER TABLE renter.tenants
  ADD CONSTRAINT tenants_clerk_user_id_key UNIQUE (clerk_user_id),
  ADD CONSTRAINT tenants_email_org_unique  UNIQUE (organization_id, email);

CREATE INDEX idx_tenants_clerk ON renter.tenants(clerk_user_id);

-- Drop the tenant_profile_id FK, constraint, index, and column
ALTER TABLE renter.tenants DROP CONSTRAINT IF EXISTS tenants_tenant_profile_id_fkey;
ALTER TABLE renter.tenants DROP CONSTRAINT IF EXISTS tenants_org_profile_unique;
DROP INDEX IF EXISTS renter.idx_tenants_profile;
ALTER TABLE renter.tenants DROP COLUMN tenant_profile_id;

-- Drop tenant_profiles table
DROP TABLE IF EXISTS renter.tenant_profiles;
