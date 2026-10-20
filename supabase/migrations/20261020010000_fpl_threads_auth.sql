-- FPL: Antworten (Threads), Login und Rechte.
-- Admin: manuelzeltner@gmail.com (bestätigte E-Mail) darf alles bearbeiten, löschen und umhängen.
-- Post-its ohne Login (user_id null, nicht vom Kick-off) dürfen alle bearbeiten und löschen.
-- Post-its von eingeloggten Personen darf nur die Person selbst (und der Admin) ändern.
-- Kick-off-Post-its (is_seed) darf nur der Admin ändern.

alter table public.fpl_notes
  add column if not exists parent_id uuid references public.fpl_notes(id) on delete set null,
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists fpl_notes_parent_idx on public.fpl_notes (parent_id);

create or replace function public.fpl_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and lower(u.email) = 'manuelzeltner@gmail.com'
      and u.email_confirmed_at is not null
  );
$$;

create or replace function public.fpl_can_edit(p_user uuid, p_seed boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fpl_is_admin()
      or (p_user is not null and p_user = auth.uid())
      or (p_user is null and not p_seed);
$$;

-- Wer abstimmt: eingeloggt über das Konto, sonst über den Browser-Token.
create or replace function public.fpl_voter(p_token text)
returns text
language plpgsql
stable
as $$
begin
  if auth.uid() is not null then
    return 'u:' || auth.uid()::text;
  end if;
  return fpl_hash(p_token);
end;
$$;

drop function if exists public.fpl_list(text);
create function public.fpl_list(p_token text default null)
returns table (id uuid, q smallint, body text, is_seed boolean, parent_id uuid, votes bigint, mine boolean, own boolean, can_edit boolean, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_voter text := case when auth.uid() is not null then 'u:' || auth.uid()::text
                       when p_token is null or length(p_token) < 16 then null
                       else fpl_hash(p_token) end;
  v_author text := case when p_token is null or length(p_token) < 16 then null else fpl_hash(p_token) end;
begin
  return query
  select n.id, n.q, n.body, n.is_seed, n.parent_id,
         (select count(*) from fpl_votes v where v.note_id = n.id),
         coalesce(v_voter is not null and exists (select 1 from fpl_votes v where v.note_id = n.id and v.voter_hash = v_voter), false),
         coalesce((n.user_id is not null and n.user_id = auth.uid()) or (n.user_id is null and v_author is not null and n.author_hash = v_author), false),
         fpl_can_edit(n.user_id, n.is_seed),
         n.created_at
  from fpl_notes n
  order by n.created_at, n.id;
end;
$$;

drop function if exists public.fpl_add_note(int, text, text);
create function public.fpl_add_note(p_q int, p_body text, p_token text, p_parent uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := fpl_hash(p_token);
  v_body text := btrim(coalesce(p_body, ''));
  v_q int := p_q;
  v_parent uuid := p_parent;
  v_id uuid;
begin
  if char_length(v_body) not between 1 and 200 then raise exception 'invalid text'; end if;
  if v_parent is not null then
    select coalesce(n.parent_id, n.id), n.q into v_parent, v_q from fpl_notes n where n.id = p_parent;
    if v_parent is null then raise exception 'invalid parent'; end if;
  end if;
  if v_q not between 1 and 5 then raise exception 'invalid question'; end if;
  if (select count(*) from fpl_notes n where n.author_hash = v_hash and n.created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'rate limit';
  end if;
  insert into fpl_notes (q, body, author_hash, user_id, parent_id)
  values (v_q, v_body, v_hash, auth.uid(), v_parent)
  returning fpl_notes.id into v_id;
  return v_id;
end;
$$;

create or replace function public.fpl_edit_note(p_note uuid, p_body text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_n int;
begin
  if char_length(v_body) not between 1 and 200 then raise exception 'invalid text'; end if;
  update fpl_notes n set body = v_body
  where n.id = p_note and fpl_can_edit(n.user_id, n.is_seed);
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- Daumen setzen bzw. zurücknehmen; gibt zurück, ob der Daumen jetzt gesetzt ist.
create or replace function public.fpl_toggle_vote(p_note uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voter text := fpl_voter(p_token);
  v_n int;
begin
  delete from fpl_votes v where v.note_id = p_note and v.voter_hash = v_voter;
  get diagnostics v_n = row_count;
  if v_n > 0 then return false; end if;
  if (select count(*) from fpl_votes v where v.voter_hash = v_voter and v.created_at > now() - interval '1 minute') >= 60 then
    raise exception 'rate limit';
  end if;
  insert into fpl_votes (note_id, voter_hash) values (p_note, v_voter);
  return true;
end;
$$;

drop function if exists public.fpl_delete_note(uuid, text);
create function public.fpl_delete_note(p_note uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  delete from fpl_notes n where n.id = p_note and fpl_can_edit(n.user_id, n.is_seed);
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- Admin: Post-it einer Frage zuordnen und/oder an ein anderes Post-it hängen (Antwort darauf);
-- p_parent null = eigenständig. Antworten wandern mit.
create or replace function public.fpl_move_note(p_note uuid, p_q int, p_parent uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q int := p_q;
  v_parent uuid := p_parent;
begin
  if not fpl_is_admin() then raise exception 'not allowed'; end if;
  if p_parent is not null then
    select coalesce(n.parent_id, n.id), n.q into v_parent, v_q from fpl_notes n where n.id = p_parent;
    if v_parent is null then raise exception 'invalid parent'; end if;
    if v_parent = p_note then raise exception 'invalid parent'; end if;
  end if;
  if v_q not between 1 and 5 then raise exception 'invalid question'; end if;
  update fpl_notes n set q = v_q, parent_id = v_parent where n.id = p_note;
  if v_parent is not null then
    update fpl_notes n set q = v_q, parent_id = v_parent where n.parent_id = p_note;
  else
    update fpl_notes n set q = v_q where n.parent_id = p_note;
  end if;
  return true;
end;
$$;

grant execute on function public.fpl_is_admin() to anon, authenticated;
grant execute on function public.fpl_list(text) to anon, authenticated;
grant execute on function public.fpl_add_note(int, text, text, uuid) to anon, authenticated;
grant execute on function public.fpl_edit_note(uuid, text) to anon, authenticated;
grant execute on function public.fpl_toggle_vote(uuid, text) to anon, authenticated;
grant execute on function public.fpl_delete_note(uuid) to anon, authenticated;
grant execute on function public.fpl_move_note(uuid, int, uuid) to anon, authenticated;
revoke execute on function public.fpl_can_edit(uuid, boolean) from anon, authenticated;
revoke execute on function public.fpl_voter(text) from anon, authenticated;
revoke execute on function public.fpl_hash(text) from anon, authenticated;

-- Überlappende Post-its vom Kick-off: das vordere antwortet auf das hintere.
update public.fpl_notes c set parent_id = p.id
from public.fpl_notes p
where c.is_seed and p.is_seed and c.q = p.q and (c.body, p.body) in (
  ('No incentive for planners to innovate', 'No incentive to innovate for owners'),
  ('And owners which build a lot.', 'Only contractors have incentive to innovate'),
  ('Like to write the „Leistungsverzeichnis“', 'For repetitive tasks'),
  ('To evaluate output from computer', 'Deep technical knowledge'),
  ('To design better & more creative', 'Deep technical knowledge'),
  ('To be brave enough to put new ideas into practice', 'Deep technical knowledge')
);
