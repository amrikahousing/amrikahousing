ALTER TABLE renter.leases
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS idx_leases_deleted_at
  ON renter.leases (deleted_at)
  WHERE deleted_at IS NULL;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS idx_properties_deleted_at
  ON public.properties (deleted_at)
  WHERE deleted_at IS NULL;

ALTER TABLE renter.tenants
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS idx_tenants_deleted_at
  ON renter.tenants (deleted_at)
  WHERE deleted_at IS NULL;

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS idx_units_deleted_at
  ON public.units (deleted_at)
  WHERE deleted_at IS NULL;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS idx_users_deleted_at
  ON public.users (deleted_at)
  WHERE deleted_at IS NULL;
