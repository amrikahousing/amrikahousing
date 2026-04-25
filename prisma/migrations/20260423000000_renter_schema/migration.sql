-- Create the renter schema
CREATE SCHEMA IF NOT EXISTS renter;

-- Move tables to renter schema (preserves all data, constraints, and indexes)
ALTER TABLE IF EXISTS public.tenants SET SCHEMA renter;
ALTER TABLE IF EXISTS public.leases SET SCHEMA renter;
ALTER TABLE IF EXISTS public.lease_tenants SET SCHEMA renter;
ALTER TABLE IF EXISTS public.payments SET SCHEMA renter;

-- Grant usage on the renter schema to the database role
GRANT USAGE ON SCHEMA renter TO PUBLIC;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA renter TO PUBLIC;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA renter TO PUBLIC;
