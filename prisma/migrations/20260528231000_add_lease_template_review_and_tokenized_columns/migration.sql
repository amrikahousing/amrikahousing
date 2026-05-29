ALTER TABLE public.lease_templates
  ADD COLUMN IF NOT EXISTS tokenized_content text,
  ADD COLUMN IF NOT EXISTS tokenized_docx_url text,
  ADD COLUMN IF NOT EXISTS review_data jsonb;
