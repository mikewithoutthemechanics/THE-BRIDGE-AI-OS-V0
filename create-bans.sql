create table if not exists public.bans (
  id bigint generated always as identity primary key,
  ip text,
  reason text,
  ts timestamptz default now()
);
