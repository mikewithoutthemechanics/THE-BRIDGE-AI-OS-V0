create table if not exists public.actions (
  id bigint generated always as identity primary key,
  ts timestamptz,
  type text,
  target text
);
