<<<<<<< HEAD
-- 001_settings.sql — Postgres schema for the settings system
--
-- Current impl uses data/settings.runtime.json (file-backed). This migration
-- is checked in so that when we outgrow the JSON store we can run it verbatim
-- and point lib/settings-store.js at a pg pool instead.
--
-- Design:
--   - settings_users stores per-user tier + overrides (JSONB for flexibility)
--   - settings_audit is append-only (never UPDATE, never DELETE outside of retention purge)
--   - settings_tiers mirrors config/settings.default.json.tiers so the DB can be
--     authoritative after migration (for now, the JSON file is authoritative)
--   - All tables use UTC timestamps and soft-delete semantics via revoked_at
--
-- Run with:  psql "$DATABASE_URL" -f db/migrations/001_settings.sql

BEGIN;

CREATE TABLE IF NOT EXISTS settings_tiers (
  tier_key       TEXT PRIMARY KEY,
  description    TEXT NOT NULL,
  features       JSONB NOT NULL DEFAULT '{}',
  limits         JSONB NOT NULL DEFAULT '{}',
  ui             JSONB NOT NULL DEFAULT '{}',
  capabilities   TEXT[] NOT NULL DEFAULT '{}',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     TEXT
);

CREATE TABLE IF NOT EXISTS settings_users (
  email          CITEXT PRIMARY KEY,
  tier           TEXT NOT NULL DEFAULT 'free' REFERENCES settings_tiers(tier_key),
  overrides      JSONB NOT NULL DEFAULT '{}',
  granted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by     TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     TEXT,
  revoked_at     TIMESTAMPTZ,
  revoked_by     TEXT
);

-- CITEXT is case-insensitive text; requires: CREATE EXTENSION IF NOT EXISTS citext;
-- If you can't use CITEXT, change to TEXT and enforce lowercase in the resolver.

CREATE TABLE IF NOT EXISTS settings_audit (
  id             BIGSERIAL PRIMARY KEY,
  ts             TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor          CITEXT NOT NULL,
  action         TEXT NOT NULL,
  target         CITEXT,
  prev           JSONB,
  next           JSONB,
  request_id     TEXT,
  ip             INET
);

CREATE INDEX IF NOT EXISTS idx_settings_audit_ts        ON settings_audit (ts DESC);
CREATE INDEX IF NOT EXISTS idx_settings_audit_actor     ON settings_audit (actor);
CREATE INDEX IF NOT EXISTS idx_settings_audit_target    ON settings_audit (target);
CREATE INDEX IF NOT EXISTS idx_settings_users_tier      ON settings_users (tier) WHERE revoked_at IS NULL;

-- Trigger: any UPDATE to settings_users must be audited (enforced in app code too,
-- but a DB-level safety net catches out-of-band writes).
CREATE OR REPLACE FUNCTION settings_users_audit_trigger() RETURNS trigger AS $$
BEGIN
  INSERT INTO settings_audit (actor, action, target, prev, next)
  VALUES (
    COALESCE(current_setting('app.actor', true), 'db_direct'),
    TG_OP,
    NEW.email,
    to_jsonb(OLD),
    to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_settings_users_audit ON settings_users;
CREATE TRIGGER trg_settings_users_audit
AFTER INSERT OR UPDATE ON settings_users
FOR EACH ROW EXECUTE FUNCTION settings_users_audit_trigger();

-- Invariant: at least one active super_admin must exist at all times.
-- Enforced via a CHECK that counts super_admins after the transaction.
CREATE OR REPLACE FUNCTION enforce_super_admin_floor() RETURNS trigger AS $$
DECLARE
  n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM settings_users WHERE tier = 'super_admin' AND revoked_at IS NULL;
  IF n < 1 THEN
    RAISE EXCEPTION 'invariant_violated: at least one active super_admin required';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_super_admin_floor ON settings_users;
CREATE CONSTRAINT TRIGGER trg_super_admin_floor
AFTER INSERT OR UPDATE OR DELETE ON settings_users
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_super_admin_floor();

COMMIT;
=======
-- 001_settings.sql — Postgres schema for the settings system
--
-- Current impl uses data/settings.runtime.json (file-backed). This migration
-- is checked in so that when we outgrow the JSON store we can run it verbatim
-- and point lib/settings-store.js at a pg pool instead.
--
-- Design:
--   - settings_users stores per-user tier + overrides (JSONB for flexibility)
--   - settings_audit is append-only (never UPDATE, never DELETE outside of retention purge)
--   - settings_tiers mirrors config/settings.default.json.tiers so the DB can be
--     authoritative after migration (for now, the JSON file is authoritative)
--   - All tables use UTC timestamps and soft-delete semantics via revoked_at
--
-- Run with:  psql "$DATABASE_URL" -f db/migrations/001_settings.sql

BEGIN;

CREATE TABLE IF NOT EXISTS settings_tiers (
  tier_key       TEXT PRIMARY KEY,
  description    TEXT NOT NULL,
  features       JSONB NOT NULL DEFAULT '{}',
  limits         JSONB NOT NULL DEFAULT '{}',
  ui             JSONB NOT NULL DEFAULT '{}',
  capabilities   TEXT[] NOT NULL DEFAULT '{}',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     TEXT
);

CREATE TABLE IF NOT EXISTS settings_users (
  email          CITEXT PRIMARY KEY,
  tier           TEXT NOT NULL DEFAULT 'free' REFERENCES settings_tiers(tier_key),
  overrides      JSONB NOT NULL DEFAULT '{}',
  granted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by     TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     TEXT,
  revoked_at     TIMESTAMPTZ,
  revoked_by     TEXT
);

-- CITEXT is case-insensitive text; requires: CREATE EXTENSION IF NOT EXISTS citext;
-- If you can't use CITEXT, change to TEXT and enforce lowercase in the resolver.

CREATE TABLE IF NOT EXISTS settings_audit (
  id             BIGSERIAL PRIMARY KEY,
  ts             TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor          CITEXT NOT NULL,
  action         TEXT NOT NULL,
  target         CITEXT,
  prev           JSONB,
  next           JSONB,
  request_id     TEXT,
  ip             INET
);

CREATE INDEX IF NOT EXISTS idx_settings_audit_ts        ON settings_audit (ts DESC);
CREATE INDEX IF NOT EXISTS idx_settings_audit_actor     ON settings_audit (actor);
CREATE INDEX IF NOT EXISTS idx_settings_audit_target    ON settings_audit (target);
CREATE INDEX IF NOT EXISTS idx_settings_users_tier      ON settings_users (tier) WHERE revoked_at IS NULL;

-- Trigger: any UPDATE to settings_users must be audited (enforced in app code too,
-- but a DB-level safety net catches out-of-band writes).
CREATE OR REPLACE FUNCTION settings_users_audit_trigger() RETURNS trigger AS $$
BEGIN
  INSERT INTO settings_audit (actor, action, target, prev, next)
  VALUES (
    COALESCE(current_setting('app.actor', true), 'db_direct'),
    TG_OP,
    NEW.email,
    to_jsonb(OLD),
    to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_settings_users_audit ON settings_users;
CREATE TRIGGER trg_settings_users_audit
AFTER INSERT OR UPDATE ON settings_users
FOR EACH ROW EXECUTE FUNCTION settings_users_audit_trigger();

-- Invariant: at least one active super_admin must exist at all times.
-- Enforced via a CHECK that counts super_admins after the transaction.
CREATE OR REPLACE FUNCTION enforce_super_admin_floor() RETURNS trigger AS $$
DECLARE
  n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM settings_users WHERE tier = 'super_admin' AND revoked_at IS NULL;
  IF n < 1 THEN
    RAISE EXCEPTION 'invariant_violated: at least one active super_admin required';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_super_admin_floor ON settings_users;
CREATE CONSTRAINT TRIGGER trg_super_admin_floor
AFTER INSERT OR UPDATE OR DELETE ON settings_users
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_super_admin_floor();

COMMIT;
>>>>>>> a65a24150727639fde77daadeba4361af473827a
