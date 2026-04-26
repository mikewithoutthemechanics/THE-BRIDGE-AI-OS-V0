# Database Migration Plan
**Agent:** Agent-4A — Data Layer Migrations
**Date:** 2026-03-25
**Contract:** `shared/database-schema.json`
**Gate condition:** Zero data loss (checksums match), rollback < 5 minutes

---

## 1. Current State: What Databases/Tables Exist

### 1.1 File-Level Survey

No `.db` or `.sqlite` files were found on disk at the time of this audit. The three source databases named in the contract (`aoe-unified.db`, `bridgeos.db`, `BRIDGE_AI_OS.db`) have **not yet been created**. All data structures are currently implied by server code only.

### 1.2 Tables Inferred from Source Code

#### `Xpayments/server.js` — PostgreSQL (active, Docker container `bridge-ai-os-aoe-dromedaries-db-1:5432/postgres`)

This is the only service with an active DB connection today.

| Table | Columns | Notes |
|---|---|---|
| `payments` | `id` (PK), `email`, `amount`, `source`, `status` | Dedup key: `(source, email, amount)` |
| `users` | `id` (PK), `email` (UNIQUE), `active` (bool), `credits` (int) | Upsert on conflict by email |

#### `server.js` (root) — No DB

Routes `/api/auth/register` and `/api/status` return JSON in-memory. No persistence layer. User registration data is currently discarded after response.

#### `system.js` — No DB

Engine scanner, economic scanner, and AI recommendations are all computed in-memory at request time. Log entries are written to flat `.jsonl` files under `logs/scan-YYYY-MM-DD.jsonl`. No SQL tables.

#### `Xcontainerx/server.js` — No DB

WebSocket terminal sessions are held in a `Map()` in process memory only. Session state is ephemeral and intentionally not persisted.

### 1.3 Source DB Summary

| Source DB name (contract) | Current status | Inferred tables |
|---|---|---|
| `aoe-unified.db` | Does not exist on disk | `users`, `sessions` (implied by `/api/auth/register`) |
| `bridgeos.db` | Does not exist on disk | `registry_nodes`, `topology_edges` (implied by dashboard manifest) |
| `BRIDGE_AI_OS.db` | Partially live as Docker PG | `payments`, `users` (confirmed in `Xpayments/server.js`) |

---

## 2. Target Unified Schema

**Target engine:** PostgreSQL 15+
**Target database name:** `supadash_unified`
**Isolation strategy:** PostgreSQL schemas (namespaces) — one schema per origin system.

### 2.1 Namespace: `aoe_unified`

```sql
CREATE SCHEMA IF NOT EXISTS aoe_unified;

-- User accounts originating from the aoe-unified system
CREATE TABLE aoe_unified.users (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT,
    active        BOOLEAN     NOT NULL DEFAULT false,
    credits       INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    migrated_from TEXT        -- source system tag, e.g. 'aoe-unified'
);

-- Session tokens for aoe_unified users
CREATE TABLE aoe_unified.sessions (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    BIGINT      NOT NULL REFERENCES aoe_unified.users(id) ON DELETE CASCADE,
    token_hash TEXT        NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registration funnel events (was discarded by root server.js)
CREATE TABLE aoe_unified.registration_events (
    id         BIGSERIAL   PRIMARY KEY,
    payload    JSONB       NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Engine scan results (was flat JSONL in logs/)
CREATE TABLE aoe_unified.engine_scans (
    id         BIGSERIAL   PRIMARY KEY,
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    results    JSONB       NOT NULL  -- full ENGINE_DEFS array with version/status
);

-- Economic scan snapshots
CREATE TABLE aoe_unified.economic_scans (
    id         BIGSERIAL   PRIMARY KEY,
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    streams    JSONB       NOT NULL,
    costs      JSONB       NOT NULL,
    summary    JSONB       NOT NULL
);
```

### 2.2 Namespace: `bridgeos`

```sql
CREATE SCHEMA IF NOT EXISTS bridgeos;

-- Network topology nodes (used by topology.html dashboard)
CREATE TABLE bridgeos.topology_nodes (
    id          BIGSERIAL   PRIMARY KEY,
    node_key    TEXT        NOT NULL UNIQUE,  -- e.g. 'laptop-1', 'gateway'
    label       TEXT,
    node_type   TEXT,                         -- RUNTIME, DATABASE, WEBSERVER, etc.
    status      TEXT        NOT NULL DEFAULT 'UNKNOWN',
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Directed edges between topology nodes
CREATE TABLE bridgeos.topology_edges (
    id          BIGSERIAL   PRIMARY KEY,
    source_id   BIGINT      NOT NULL REFERENCES bridgeos.topology_nodes(id),
    target_id   BIGINT      NOT NULL REFERENCES bridgeos.topology_nodes(id),
    edge_type   TEXT,
    weight      REAL        DEFAULT 1.0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registry entries (kernel, network, security, federation, jobs, market)
CREATE TABLE bridgeos.registry_entries (
    id           BIGSERIAL   PRIMARY KEY,
    namespace    TEXT        NOT NULL,  -- 'kernel', 'network', 'security', etc.
    entry_key    TEXT        NOT NULL,
    entry_value  JSONB       NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (namespace, entry_key)
);

-- ContainerX sessions audit log (was in-memory Map only)
CREATE TABLE bridgeos.container_sessions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at     TIMESTAMPTZ,
    exit_code    INTEGER,
    duration_ms  INTEGER
);
```

### 2.3 Namespace: `bridge_ai_os`

```sql
CREATE SCHEMA IF NOT EXISTS bridge_ai_os;

-- Migrated from Xpayments/server.js (payments table)
CREATE TABLE bridge_ai_os.payments (
    id          BIGSERIAL   PRIMARY KEY,
    email       TEXT        NOT NULL,
    amount      NUMERIC(12,2) NOT NULL,
    source      TEXT        NOT NULL,  -- 'payfast', etc.
    status      TEXT        NOT NULL DEFAULT 'pending',
    payload     JSONB,                 -- full webhook body
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source, email, amount)     -- preserves dedup logic from original code
);

-- Migrated from Xpayments/server.js (users table) — bridge_ai_os variant
CREATE TABLE bridge_ai_os.users (
    id          BIGSERIAL   PRIMARY KEY,
    email       TEXT        NOT NULL UNIQUE,
    active      BOOLEAN     NOT NULL DEFAULT false,
    credits     INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    migrated_from TEXT      DEFAULT 'BRIDGE_AI_OS'
);

-- Referral / affiliate tracking (implied by /go/r.php redirect funnel)
CREATE TABLE bridge_ai_os.referrals (
    id           BIGSERIAL   PRIMARY KEY,
    referrer_id  BIGINT      REFERENCES bridge_ai_os.users(id),
    referred_email TEXT,
    source_url   TEXT,
    converted    BOOLEAN     NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Marketplace items
CREATE TABLE bridge_ai_os.marketplace_items (
    id           BIGSERIAL   PRIMARY KEY,
    item_type    TEXT        NOT NULL,  -- 'task', 'skill', 'portfolio', 'stats'
    owner_id     BIGINT      REFERENCES bridge_ai_os.users(id),
    title        TEXT        NOT NULL,
    description  TEXT,
    price        NUMERIC(12,2),
    metadata     JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Avatar render configurations (6 rendering modes from dashboard manifest)
CREATE TABLE bridge_ai_os.avatar_configs (
    id           BIGSERIAL   PRIMARY KEY,
    user_id      BIGINT      REFERENCES bridge_ai_os.users(id),
    render_mode  TEXT        NOT NULL,  -- babylon.js mode key
    config_data  JSONB       NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.4 Cross-Namespace View (unified user identity)

```sql
-- Unified view across all three user tables for auth consolidation
-- Used by Agent-5A auth service
CREATE VIEW public.unified_users AS
    SELECT id, email, active, credits, 'aoe_unified'   AS origin FROM aoe_unified.users
    UNION ALL
    SELECT id, email, active, credits, 'bridge_ai_os'  AS origin FROM bridge_ai_os.users;
```

---

## 3. Migration Steps (Ordered, with Rollback)

> Prerequisite: PostgreSQL 15+ running and accessible.
> Connection string env var: `DATABASE_URL=postgresql://USER:PASS@HOST:5432/supadash_unified`

---

### Step 0 — Provision target database
**Effort:** 30 min | **Risk:** Low

```sql
-- Run as superuser
CREATE DATABASE supadash_unified;
CREATE USER supadash_app WITH PASSWORD '<strong-password>';
GRANT CONNECT ON DATABASE supadash_unified TO supadash_app;
```

**Rollback:** `DROP DATABASE supadash_unified;`

---

### Step 1 — Create schemas and tables (DDL only, no data)
**Effort:** 1 hour | **Risk:** Low

Run all `CREATE SCHEMA` and `CREATE TABLE` statements from Section 2 in order:
1. `aoe_unified` schema
2. `bridgeos` schema
3. `bridge_ai_os` schema
4. `public.unified_users` view

Grant permissions:
```sql
GRANT USAGE ON SCHEMA aoe_unified, bridgeos, bridge_ai_os TO supadash_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA aoe_unified TO supadash_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA bridgeos TO supadash_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA bridge_ai_os TO supadash_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA aoe_unified, bridgeos, bridge_ai_os TO supadash_app;
```

**Rollback:**
```sql
DROP SCHEMA aoe_unified CASCADE;
DROP SCHEMA bridgeos CASCADE;
DROP SCHEMA bridge_ai_os CASCADE;
DROP VIEW IF EXISTS public.unified_users;
```

---

### Step 2 — Migrate BRIDGE_AI_OS payments and users (the only live data)
**Effort:** 2 hours | **Risk:** Medium (live data)

Source: Docker container `bridge-ai-os-aoe-dromedaries-db-1:5432/postgres`

```bash
# 2a. Dump source tables
pg_dump \
  -h bridge-ai-os-aoe-dromedaries-db-1 -p 5432 -U postgres \
  -t payments -t users \
  --data-only --column-inserts \
  postgres > /tmp/bridge_ai_os_dump.sql

# 2b. Checksum the dump
sha256sum /tmp/bridge_ai_os_dump.sql > /tmp/bridge_ai_os_dump.sql.sha256
```

```sql
-- 2c. Load into bridge_ai_os namespace
-- Payments (map columns directly — schema is identical)
INSERT INTO bridge_ai_os.payments (email, amount, source, status, created_at)
SELECT email, amount::NUMERIC, source, status, NOW()
FROM dblink(
  'host=bridge-ai-os-aoe-dromedaries-db-1 port=5432 user=postgres dbname=postgres',
  'SELECT email, amount, source, status FROM payments'
) AS t(email TEXT, amount TEXT, source TEXT, status TEXT)
ON CONFLICT (source, email, amount) DO NOTHING;

-- Users
INSERT INTO bridge_ai_os.users (email, active, credits, created_at, migrated_from)
SELECT email, active, credits, NOW(), 'BRIDGE_AI_OS'
FROM dblink(
  'host=bridge-ai-os-aoe-dromedaries-db-1 port=5432 user=postgres dbname=postgres',
  'SELECT email, active, credits FROM users'
) AS t(email TEXT, active BOOLEAN, credits INTEGER)
ON CONFLICT (email) DO UPDATE
  SET active = EXCLUDED.active,
      credits = bridge_ai_os.users.credits + EXCLUDED.credits;
```

**Integrity check:**
```sql
-- Row counts must match source
SELECT COUNT(*) FROM bridge_ai_os.payments;  -- must equal source payments count
SELECT COUNT(*) FROM bridge_ai_os.users;     -- must equal source users count

-- No orphaned payments (email exists in users)
SELECT COUNT(*) FROM bridge_ai_os.payments p
LEFT JOIN bridge_ai_os.users u ON p.email = u.email
WHERE u.id IS NULL;  -- must be 0
```

**Rollback:**
```sql
TRUNCATE bridge_ai_os.payments CASCADE;
TRUNCATE bridge_ai_os.users CASCADE;
```

---

### Step 3 — Backfill aoe_unified.users from registration events
**Effort:** 1 hour | **Risk:** Low (no existing data to lose)

Since `server.js /api/auth/register` currently discards data, there is nothing to migrate. This step seeds the table structure and instruments the endpoint going forward.

Action: Update `server.js` to insert into `aoe_unified.registration_events` on each register call.

```sql
-- Verify table is empty and writable
INSERT INTO aoe_unified.registration_events (payload)
VALUES ('{"test": true}'::jsonb);
DELETE FROM aoe_unified.registration_events WHERE payload->>'test' = 'true';
-- Expected: 1 row inserted, 1 deleted, 0 rows remaining
```

**Rollback:** No data existed before; truncate if needed.

---

### Step 4 — Migrate flat JSONL logs to engine_scans / economic_scans
**Effort:** 2 hours | **Risk:** Low

```bash
# Find all log files
find /c/aoe-unified-final/logs -name "scan-*.jsonl" | sort
```

```python
# migration script: migrate_logs.py
import json, psycopg2, os, glob

conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

for filepath in glob.glob('/c/aoe-unified-final/logs/scan-*.jsonl'):
    with open(filepath) as f:
        for line in f:
            entry = json.loads(line.strip())
            if entry.get('category') == 'ENGINES':
                cur.execute(
                    "INSERT INTO aoe_unified.engine_scans (scanned_at, results) VALUES (%s, %s)",
                    (entry['ts'] / 1000, json.dumps(entry.get('data', {})))
                )

conn.commit()
cur.close()
conn.close()
```

**Integrity check:**
```sql
SELECT COUNT(*) FROM aoe_unified.engine_scans;
-- Must be >= number of JSONL log lines with category='ENGINES'
```

**Rollback:**
```sql
TRUNCATE aoe_unified.engine_scans;
TRUNCATE aoe_unified.economic_scans;
```

---

### Step 5 — Seed bridgeos topology from topology_snapshot.txt
**Effort:** 2 hours | **Risk:** Low

`topology_snapshot.txt` exists at the repo root. Parse it to seed initial node/edge records.

```bash
# Checksum source file before reading
sha256sum /c/aoe-unified-final/topology_snapshot.txt
```

```sql
-- After parsing topology_snapshot.txt and generating INSERT statements:
-- Verify node count
SELECT COUNT(*) FROM bridgeos.topology_nodes;

-- Verify no self-referencing edges
SELECT COUNT(*) FROM bridgeos.topology_edges WHERE source_id = target_id;  -- must be 0
```

**Rollback:**
```sql
TRUNCATE bridgeos.topology_edges CASCADE;
TRUNCATE bridgeos.topology_nodes CASCADE;
```

---

### Step 6 — Seed bridgeos.registry_entries
**Effort:** 3 hours | **Risk:** Low

Ingest registry data from the 8 registry dashboard source files documented in `shared/dashboard-manifest.json` (kernel, network, security, federation, jobs, market, node map, bridge OS namespaces).

Each registry HTML file exports JSON data blobs — extract and INSERT with `namespace` set to the file category.

**Integrity check:**
```sql
-- All 8 registry namespaces must be present
SELECT DISTINCT namespace FROM bridgeos.registry_entries ORDER BY 1;
-- Expected: kernel, network, security, federation, jobs, market, node_map, bridge_os

SELECT COUNT(*) FROM bridgeos.registry_entries;
```

**Rollback:**
```sql
TRUNCATE bridgeos.registry_entries;
```

---

### Step 7 — Update application connection strings
**Effort:** 1 hour | **Risk:** Medium

Update every service to point to the unified DB:

| File | Change |
|---|---|
| `Xpayments/server.js` | Change `connectionString` to `process.env.DATABASE_URL`; prefix all queries with `bridge_ai_os.` |
| `server.js` | Add `pg.Pool` import; write registration events to `aoe_unified.registration_events` |
| `system.js` | Add optional PG logging: write scan results to `aoe_unified.engine_scans` and `aoe_unified.economic_scans` |

**Rollback:** Revert to previous connection strings and remove new DB calls.

---

### Step 8 — Cutover and decommission source containers
**Effort:** 30 min | **Risk:** High (point of no return for live data)

Only execute after Steps 2 integrity checks pass AND 24-hour soak test is clean.

```bash
# Final checksum validation before cutover
psql $DATABASE_URL -c "COPY (SELECT * FROM bridge_ai_os.payments ORDER BY id) TO STDOUT" | sha256sum
psql $DATABASE_URL -c "COPY (SELECT * FROM bridge_ai_os.users ORDER BY id) TO STDOUT" | sha256sum
# Compare against /tmp/bridge_ai_os_dump.sql.sha256 equivalents
```

```bash
# Stop old container ONLY after checksums confirmed
docker stop bridge-ai-os-aoe-dromedaries-db-1
```

**Rollback:** Restart old container, revert connection strings in Xpayments/server.js.

---

## 4. Data Integrity Checks (Checksums)

Run these checks after each step and record results in the migration log.

### 4.1 Row-Count Parity

```sql
-- After Step 2: source vs. target must match
-- Source (run against old container):
SELECT
  (SELECT COUNT(*) FROM payments) AS src_payments,
  (SELECT COUNT(*) FROM users)    AS src_users;

-- Target (run against supadash_unified):
SELECT
  (SELECT COUNT(*) FROM bridge_ai_os.payments) AS tgt_payments,
  (SELECT COUNT(*) FROM bridge_ai_os.users)    AS tgt_users;
```

### 4.2 Content Checksums

```sql
-- Payments checksum (all non-PK data columns, sorted for determinism)
SELECT md5(string_agg(concat(email, amount::TEXT, source, status), '|' ORDER BY email, source))
FROM bridge_ai_os.payments;

-- Users checksum
SELECT md5(string_agg(concat(email, active::TEXT, credits::TEXT), '|' ORDER BY email))
FROM bridge_ai_os.users;
```

Run the same query against the source container and compare outputs. They must match exactly.

### 4.3 Referential Integrity

```sql
-- No payments without a matching user
SELECT COUNT(*) FROM bridge_ai_os.payments p
WHERE NOT EXISTS (SELECT 1 FROM bridge_ai_os.users u WHERE u.email = p.email);
-- Expected: 0

-- No sessions without a valid user
SELECT COUNT(*) FROM aoe_unified.sessions s
WHERE NOT EXISTS (SELECT 1 FROM aoe_unified.users u WHERE u.id = s.user_id);
-- Expected: 0

-- No topology edges referencing missing nodes
SELECT COUNT(*) FROM bridgeos.topology_edges e
WHERE NOT EXISTS (SELECT 1 FROM bridgeos.topology_nodes n WHERE n.id = e.source_id)
   OR NOT EXISTS (SELECT 1 FROM bridgeos.topology_nodes n WHERE n.id = e.target_id);
-- Expected: 0
```

### 4.4 Dedup Constraint Verification

```sql
-- The original payments dedup key (source, email, amount) must be unique
SELECT source, email, amount, COUNT(*) AS cnt
FROM bridge_ai_os.payments
GROUP BY source, email, amount
HAVING COUNT(*) > 1;
-- Expected: 0 rows
```

### 4.5 Gate Condition Checklist

| Check | Query / method | Pass criterion |
|---|---|---|
| Zero data loss | md5 checksums match source | All checksums equal |
| Row count parity | COUNT(*) both sides | Exact match |
| Referential integrity | FK orphan queries | 0 orphaned rows |
| Dedup preserved | HAVING COUNT(*) > 1 | 0 violations |
| Schema version | `SELECT current_schemas(false)` | aoe_unified, bridgeos, bridge_ai_os present |
| Rollback speed test | Time `DROP SCHEMA ... CASCADE` | < 5 minutes wall clock |

---

## 5. Estimated Effort per Step

| Step | Description | Effort | Risk | Depends on |
|---|---|---|---|---|
| 0 | Provision target PostgreSQL database | 30 min | Low | PG 15+ running |
| 1 | DDL: create all schemas, tables, view | 1 hr | Low | Step 0 |
| 2 | Migrate live payments + users data | 2 hr | Medium | Step 1 |
| 3 | Instrument server.js registration endpoint | 1 hr | Low | Step 1 |
| 4 | Migrate JSONL logs to engine_scans table | 2 hr | Low | Step 1 |
| 5 | Seed topology nodes/edges from snapshot | 2 hr | Low | Step 1 |
| 6 | Seed registry entries from dashboard HTML | 3 hr | Low | Step 1 |
| 7 | Update app connection strings | 1 hr | Medium | Steps 2–6 |
| 8 | Cutover + decommission source containers | 30 min | High | Step 7 + 24h soak |
| **Total** | | **~13 hr** | | |

---

## 6. Dependencies

- **Agent-2A** (Gateway): Must update gateway routing once `DATABASE_URL` env var is set (Step 7).
- **Agent-5A** (Auth): `public.unified_users` view (Section 2.4) is the contract surface — do not alter column names without coordinating.
- **Agent-6A** (Tests): Step 2 integrity checks (Section 4) should be wrapped as Jest integration tests against a test DB clone before Step 8 runs.

---

## 7. Environment Variables Required

```bash
DATABASE_URL=postgresql://supadash_app:<password>@<host>:5432/supadash_unified
BRIDGE_AI_OS_DB_URL=postgresql://postgres:<password>@bridge-ai-os-aoe-dromedaries-db-1:5432/postgres
# Legacy — remove after Step 8
```
