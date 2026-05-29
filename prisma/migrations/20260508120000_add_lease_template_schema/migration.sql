ALTER TABLE public.lease_templates
  ADD COLUMN IF NOT EXISTS lease_schema jsonb;
