-- CLUB 74 — stockage privé, un enregistrement JSON par objet (séance, pesée, activité…).
-- Chaque ligne appartient à un utilisateur ; RLS interdit tout accès croisé.

create table if not exists public.club74_records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  collection text        not null check (collection in ('config', 'workouts', 'activities', 'weights', 'plans')),
  id         text        not null,
  data       jsonb       not null,
  -- Horodatage client (ms) de la dernière modification : arbitre « dernier écrit gagne ».
  updated_at bigint      not null,
  deleted    boolean     not null default false,
  -- Horodatage serveur : curseur de synchronisation incrémentale.
  server_ts  timestamptz not null default clock_timestamp(),
  primary key (user_id, collection, id)
);

create index if not exists club74_records_user_ts on public.club74_records (user_id, server_ts);

alter table public.club74_records enable row level security;

drop policy if exists "club74 own rows" on public.club74_records;
create policy "club74 own rows" on public.club74_records
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Upsert en lot : une ligne n'est remplacée que par une version plus récente.
create or replace function public.club74_push(items jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.club74_records as r (user_id, collection, id, data, updated_at, deleted, server_ts)
  select auth.uid(), i.collection, i.id, i.data, i.updated_at, coalesce(i.deleted, false), clock_timestamp()
  from jsonb_to_recordset(items) as i(collection text, id text, data jsonb, updated_at bigint, deleted boolean)
  on conflict (user_id, collection, id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at,
        deleted = excluded.deleted,
        server_ts = clock_timestamp()
    where r.updated_at < excluded.updated_at;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.club74_push(jsonb) from public, anon;
grant execute on function public.club74_push(jsonb) to authenticated;
