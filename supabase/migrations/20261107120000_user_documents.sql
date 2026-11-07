-- user_documents: one row per user per synced document (src/sync/syncTargets.ts).
--
-- NOT APPLIED. This file awaits the owner's approval; nothing applies it
-- automatically. Until it is applied, every document other than the Team
-- Builder's stays local-only (the app treats the missing table silently), and
-- the Team Builder keeps syncing through the existing `team_builder_docs`.
--
-- Idempotent where Postgres allows: the table is created only if absent, and each
-- policy is dropped before it is created.

create table if not exists public.user_documents (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  name       text        not null constraint user_documents_name_not_empty check (length(btrim(name)) > 0),
  version    integer     not null default 1 check (version >= 1),
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, name)
);

alter table public.user_documents enable row level security;

-- Own rows only. `(select auth.uid())` is auth.uid() evaluated once per query
-- rather than once per row (Supabase's RLS performance advice).
drop policy if exists "user_documents: select own" on public.user_documents;
create policy "user_documents: select own" on public.user_documents
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "user_documents: insert own" on public.user_documents;
create policy "user_documents: insert own" on public.user_documents
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_documents: update own" on public.user_documents;
create policy "user_documents: update own" on public.user_documents
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_documents: delete own" on public.user_documents;
create policy "user_documents: delete own" on public.user_documents
  for delete to authenticated
  using ((select auth.uid()) = user_id);
