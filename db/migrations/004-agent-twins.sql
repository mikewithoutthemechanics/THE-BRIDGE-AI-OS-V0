-- ============================================================================
-- BRIDGE AI OS — Migration 004: Digital Twin Registry
-- Run in Supabase SQL editor or via supabase db push
-- ============================================================================

-- ── agent_twins — one row per activated user ─────────────────────────────────
create table if not exists agent_twins (
  id            uuid default gen_random_uuid() primary key,
  user_id       text not null unique,
  agent_id      text not null,
  status        text not null default 'active',   -- pending | active | paused
  plan          text not null default 'free',
  capabilities  jsonb not null default '[]',
  tasks_run     integer not null default 0,
  brdg_spent    numeric not null default 0,
  activated_at  timestamptz default now(),
  last_seen     timestamptz default now(),
  meta          jsonb default '{}'
);

-- ── agent_tasks — task history per twin ──────────────────────────────────────
create table if not exists agent_tasks (
  id             uuid default gen_random_uuid() primary key,
  twin_id        uuid references agent_twins(id) on delete cascade,
  user_id        text not null,
  agent_name     text not null,
  status         text not null default 'completed',  -- queued | running | completed | failed
  input_summary  text,
  output_summary text,
  brdg_cost      numeric default 0.5,
  created_at     timestamptz default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_agent_twins_user_id on agent_twins(user_id);
create index if not exists idx_agent_tasks_user_id on agent_tasks(user_id);
create index if not exists idx_agent_tasks_twin_id on agent_tasks(twin_id);
create index if not exists idx_agent_tasks_created on agent_tasks(created_at desc);

-- ── RPC: increment twin counters atomically ───────────────────────────────────
create or replace function increment_twin_counters(p_user_id text, p_brdg numeric)
returns void language sql as $$
  update agent_twins
  set
    tasks_run  = tasks_run + 1,
    brdg_spent = brdg_spent + p_brdg,
    last_seen  = now()
  where user_id = p_user_id;
$$;

-- ── RLS: users can only see their own twins and tasks ─────────────────────────
alter table agent_twins enable row level security;
alter table agent_tasks  enable row level security;

-- Service role bypasses RLS automatically.
-- Anon/authenticated users see only their own rows:
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'agent_twins' and policyname = 'own_twin'
  ) then
    create policy own_twin on agent_twins
      for all using (auth.uid()::text = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'agent_tasks' and policyname = 'own_tasks'
  ) then
    create policy own_tasks on agent_tasks
      for all using (auth.uid()::text = user_id);
  end if;
end $$;
