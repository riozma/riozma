-- Stammbaum: Rollen (betrachten / bearbeiten), Änderungen an Personen, Fotos und Kontaktdaten.
--
-- Rollen
--   viewer  sieht den Stammbaum (wie bisher)
--   editor  darf Personen bearbeiten, Fotos hochladen und sieht/pflegt Kontaktdaten
--   admin   (fest: manuelzeltner@gmail.com) darf alles und vergibt Rollen
--
-- Änderungen werden NICHT in den importierten Datensatz (stammbaum_content) geschrieben, sondern als
-- Überlagerung je Person (Index im persons-Array) gespeichert. So bleiben sie bei einem neuen Import
-- erhalten, solange die Reihenfolge der Personen gleich bleibt. Jede Änderung landet zusätzlich im Protokoll.

alter table public.stammbaum_access add column if not exists role text not null default 'viewer';
alter table public.stammbaum_access drop constraint if exists stammbaum_access_role_check;
alter table public.stammbaum_access add constraint stammbaum_access_role_check check (role in ('viewer', 'editor'));

alter table public.stammbaum_invites add column if not exists role text not null default 'viewer';
alter table public.stammbaum_invites drop constraint if exists stammbaum_invites_role_check;
alter table public.stammbaum_invites add constraint stammbaum_invites_role_check check (role in ('viewer', 'editor'));

create table if not exists public.stammbaum_edits (
  pidx int primary key check (pidx >= 0),
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.stammbaum_contacts (
  pidx int primary key check (pidx >= 0),
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.stammbaum_edit_log (
  id bigint generated always as identity primary key,
  pidx int not null,
  kind text not null,
  before jsonb,
  after jsonb,
  user_id uuid,
  email text,
  created_at timestamptz not null default now()
);

alter table public.stammbaum_edits enable row level security;
alter table public.stammbaum_contacts enable row level security;
alter table public.stammbaum_edit_log enable row level security;
revoke all on public.stammbaum_edits, public.stammbaum_contacts, public.stammbaum_edit_log from anon, authenticated;

-- ---- Rollen ----
create or replace function public.stammbaum_role()
returns text language plpgsql stable security definer set search_path = public, auth as $$
declare r text;
begin
  if auth.uid() is null then return null; end if;
  if public.stammbaum_is_admin() then return 'admin'; end if;
  select a.role into r from public.stammbaum_access a where a.user_id = auth.uid() and a.status = 'approved';
  if r = 'editor' then return r; end if;
  select i.role into r from auth.users u join public.stammbaum_invites i on i.email = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null;
  if r = 'editor' then return r; end if;
  if public.stammbaum_has_access() then return 'viewer'; end if;
  return null;
end $$;

create or replace function public.stammbaum_can_edit()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select coalesce(public.stammbaum_role() in ('admin', 'editor'), false);
$$;

-- ---- Lesen: Datensatz + Änderungen (+ Kontakte nur für Bearbeiter) ----
create or replace function public.stammbaum_get()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare r text := public.stammbaum_role(); d jsonb;
begin
  if r is null then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  select data into d from public.stammbaum_content where id = 1;
  if d is null then return null; end if;
  return d || jsonb_build_object(
    'role', r,
    'edits', coalesce((select jsonb_object_agg(e.pidx::text, e.data) from public.stammbaum_edits e), '{}'::jsonb),
    'contacts', case when r in ('admin', 'editor')
      then coalesce((select jsonb_object_agg(c.pidx::text, c.data) from public.stammbaum_contacts c), '{}'::jsonb)
      else null end
  );
end $$;

-- Nur erlaubte Felder, nur Text, gekürzt. Leerer Text bedeutet «Feld entfernt».
create or replace function public.stammbaum_clean(p jsonb, p_keys text[])
returns jsonb language plpgsql immutable set search_path = public as $$
declare k text; v jsonb; out jsonb := '{}'::jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return out; end if;
  for k, v in select * from jsonb_each(p) loop
    if k = any (p_keys) and jsonb_typeof(v) in ('string', 'number', 'null') then
      out := out || jsonb_build_object(k, left(trim(coalesce(v #>> '{}', '')), case when k in ('no', 'notiz') then 8000 else 300 end));
    end if;
  end loop;
  return out;
end $$;

create or replace function public.stammbaum_check_pidx(p_idx int)
returns void language plpgsql stable security definer set search_path = public as $$
declare n int;
begin
  select jsonb_array_length(data -> 'persons') into n from public.stammbaum_content where id = 1;
  if p_idx is null or p_idx < 0 or p_idx >= coalesce(n, 0) then raise exception 'Unbekannte Person'; end if;
end $$;

-- ---- Schreiben: Personenangaben und Kontaktdaten ----
create or replace function public.stammbaum_save_person(p_idx int, p_fields jsonb, p_contact jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  f jsonb := public.stammbaum_clean(p_fields, array['n', 's', 't', 'g', 'b', 'bp', 'd', 'dp', 'rp', 'o', 'r', 'no', 'l']);
  c jsonb;
  prev jsonb;
  mail text;
begin
  if not public.stammbaum_can_edit() then raise exception 'Keine Berechtigung zum Bearbeiten' using errcode = '42501'; end if;
  perform public.stammbaum_check_pidx(p_idx);
  if f ? 'g' and f ->> 'g' not in ('', 'M', 'F') then raise exception 'Ungültiges Geschlecht'; end if;
  select email into mail from auth.users where id = auth.uid();

  if f <> '{}'::jsonb then
    select data into prev from public.stammbaum_edits where pidx = p_idx;
    insert into public.stammbaum_edits (pidx, data, updated_by) values (p_idx, f, auth.uid())
    on conflict (pidx) do update set data = stammbaum_edits.data || excluded.data, updated_by = excluded.updated_by, updated_at = now();
    insert into public.stammbaum_edit_log (pidx, kind, before, after, user_id, email) values (p_idx, 'person', prev, f, auth.uid(), mail);
  end if;

  if p_contact is not null then
    c := public.stammbaum_clean(p_contact, array['tel', 'mob', 'mail', 'str', 'ort', 'land', 'web', 'notiz']);
    select data into prev from public.stammbaum_contacts where pidx = p_idx;
    if not exists (select 1 from jsonb_each_text(c) where value <> '') then
      delete from public.stammbaum_contacts where pidx = p_idx;
      c := '{}'::jsonb;
    else
      insert into public.stammbaum_contacts (pidx, data, updated_by) values (p_idx, c, auth.uid())
      on conflict (pidx) do update set data = excluded.data, updated_by = excluded.updated_by, updated_at = now();
    end if;
    if prev is distinct from c then
      insert into public.stammbaum_edit_log (pidx, kind, before, after, user_id, email) values (p_idx, 'contact', prev, c, auth.uid(), mail);
    end if;
  end if;

  return jsonb_build_object(
    'edit', (select data from public.stammbaum_edits where pidx = p_idx),
    'contact', (select data from public.stammbaum_contacts where pidx = p_idx)
  );
end $$;

-- Foto setzen ('' entfernt es). Der Pfad muss im Foto-Bucket unter p/<index>- liegen.
create or replace function public.stammbaum_set_photo(p_idx int, p_path text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare prev jsonb; mail text; v_path text := coalesce(trim(p_path), '');
begin
  if not public.stammbaum_can_edit() then raise exception 'Keine Berechtigung zum Bearbeiten' using errcode = '42501'; end if;
  perform public.stammbaum_check_pidx(p_idx);
  if v_path <> '' and v_path !~ ('^p/' || p_idx || '-[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$') then raise exception 'Ungültiger Bildpfad'; end if;
  select email into mail from auth.users where id = auth.uid();
  select data into prev from public.stammbaum_edits where pidx = p_idx;
  insert into public.stammbaum_edits (pidx, data, updated_by) values (p_idx, jsonb_build_object('ph', v_path), auth.uid())
  on conflict (pidx) do update set data = stammbaum_edits.data || excluded.data, updated_by = excluded.updated_by, updated_at = now();
  insert into public.stammbaum_edit_log (pidx, kind, before, after, user_id, email)
    values (p_idx, 'photo', prev -> 'ph', to_jsonb(v_path), auth.uid(), mail);
  return (select data from public.stammbaum_edits where pidx = p_idx);
end $$;

-- ---- Admin: Rollen vergeben ----
create or replace function public.stammbaum_set_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.stammbaum_is_admin() then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  if p_role not in ('viewer', 'editor') then raise exception 'Ungültige Rolle'; end if;
  update public.stammbaum_access set role = p_role where user_id = p_user;
end $$;

drop function if exists public.stammbaum_list_requests();
create function public.stammbaum_list_requests()
returns table (user_id uuid, email text, name text, message text, status text, role text, requested_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.stammbaum_is_admin() then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  return query select a.user_id, a.email, a.name, a.message, a.status, a.role, a.requested_at
    from public.stammbaum_access a order by (a.status = 'pending') desc, a.requested_at desc;
end $$;

drop function if exists public.stammbaum_invite(text);
create or replace function public.stammbaum_invite(p_email text, p_role text default 'viewer')
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.stammbaum_is_admin() then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Ungültige E-Mail-Adresse'; end if;
  if coalesce(p_role, 'viewer') not in ('viewer', 'editor') then raise exception 'Ungültige Rolle'; end if;
  insert into public.stammbaum_invites (email, role) values (lower(trim(p_email)), coalesce(p_role, 'viewer'))
  on conflict (email) do update set role = excluded.role;
end $$;

drop function if exists public.stammbaum_list_invites();
create function public.stammbaum_list_invites()
returns table (email text, role text) language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.stammbaum_is_admin() then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  return query select i.email, i.role from public.stammbaum_invites i order by i.created_at desc;
end $$;

revoke all on function public.stammbaum_role(), public.stammbaum_can_edit(), public.stammbaum_get(),
  public.stammbaum_clean(jsonb, text[]), public.stammbaum_check_pidx(int),
  public.stammbaum_save_person(int, jsonb, jsonb), public.stammbaum_set_photo(int, text),
  public.stammbaum_set_role(uuid, text), public.stammbaum_list_requests(),
  public.stammbaum_invite(text, text), public.stammbaum_list_invites() from public, anon;
grant execute on function public.stammbaum_role(), public.stammbaum_can_edit(), public.stammbaum_get(),
  public.stammbaum_save_person(int, jsonb, jsonb), public.stammbaum_set_photo(int, text),
  public.stammbaum_set_role(uuid, text), public.stammbaum_list_requests(),
  public.stammbaum_invite(text, text), public.stammbaum_list_invites() to authenticated;

-- ---- Fotos: privater Bucket, lesen mit Zugang, schreiben nur Bearbeiter ----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stammbaum-photos', 'stammbaum-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "stammbaum_photos_read" on storage.objects;
create policy "stammbaum_photos_read" on storage.objects for select to authenticated
  using (bucket_id = 'stammbaum-photos' and public.stammbaum_has_access());

drop policy if exists "stammbaum_photos_insert" on storage.objects;
create policy "stammbaum_photos_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'stammbaum-photos' and public.stammbaum_can_edit());

drop policy if exists "stammbaum_photos_update" on storage.objects;
create policy "stammbaum_photos_update" on storage.objects for update to authenticated
  using (bucket_id = 'stammbaum-photos' and public.stammbaum_can_edit());

drop policy if exists "stammbaum_photos_delete" on storage.objects;
create policy "stammbaum_photos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'stammbaum-photos' and public.stammbaum_can_edit());
