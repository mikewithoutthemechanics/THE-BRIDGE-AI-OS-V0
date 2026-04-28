-- Economy identity tables replacing the in-memory Maps in server.js.
-- Backed by Supabase (postgres). All IDs are UUIDs.

CREATE TABLE IF NOT EXISTS eco_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  avatar_id   UUID,
  wallet_id   UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eco_wallets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL,
  owner_type  TEXT NOT NULL CHECK (owner_type IN ('avatar','agent')),
  balance     NUMERIC(18,4) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eco_agents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  avatar_id        UUID NOT NULL REFERENCES eco_users(avatar_id),
  wallet_id        UUID REFERENCES eco_wallets(id),
  name             TEXT NOT NULL,
  tier             TEXT NOT NULL DEFAULT 'standard',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS eco_users_email_idx   ON eco_users(email);
CREATE INDEX IF NOT EXISTS eco_agents_avatar_idx ON eco_agents(avatar_id);
