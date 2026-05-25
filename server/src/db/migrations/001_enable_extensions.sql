-- 001_enable_extensions.sql
-- Required PostgreSQL extensions for RIGHTNOW.

-- Geospatial types & indexes (live pins, venues, SOS locations).
CREATE EXTENSION IF NOT EXISTS postgis;

-- uuid_generate_* helpers (kept available alongside pgcrypto).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- gen_random_uuid() and crypto helpers used as default PKs.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
