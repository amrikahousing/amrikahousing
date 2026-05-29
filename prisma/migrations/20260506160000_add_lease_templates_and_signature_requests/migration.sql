CREATE TABLE IF NOT EXISTS public.lease_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  name text NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL,
  blob_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lease_templates_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT lease_templates_property_id_fkey
    FOREIGN KEY (property_id) REFERENCES public.properties(id)
    ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS idx_lease_templates_org
  ON public.lease_templates (organization_id);

CREATE INDEX IF NOT EXISTS idx_lease_templates_property
  ON public.lease_templates (property_id);

CREATE INDEX IF NOT EXISTS idx_lease_templates_active
  ON public.lease_templates (is_active);

CREATE TABLE IF NOT EXISTS renter.lease_signature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL,
  lease_template_id uuid,
  provider text NOT NULL DEFAULT 'pandadoc',
  provider_document_id text,
  status text NOT NULL DEFAULT 'creating',
  recipients jsonb NOT NULL,
  error text,
  sent_at timestamptz,
  completed_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lease_signature_requests_lease_id_fkey
    FOREIGN KEY (lease_id) REFERENCES renter.leases(id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT lease_signature_requests_lease_template_id_fkey
    FOREIGN KEY (lease_template_id) REFERENCES public.lease_templates(id)
    ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS lease_signature_requests_lease_unique
  ON renter.lease_signature_requests (lease_id);

CREATE INDEX IF NOT EXISTS idx_signature_requests_provider_doc
  ON renter.lease_signature_requests (provider_document_id);

CREATE INDEX IF NOT EXISTS idx_signature_requests_status
  ON renter.lease_signature_requests (status);

GRANT ALL PRIVILEGES ON TABLE public.lease_templates TO PUBLIC;
GRANT ALL PRIVILEGES ON TABLE renter.lease_signature_requests TO PUBLIC;
