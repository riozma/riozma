-- FPL Weekly: Reaktionen, Kommentare (mit Antworten), Umfrage und Moderationsstatus je Ausgabe.
-- Zugriff nur über RPC. Besucher: eingeloggt über das Konto (auth.uid()), sonst über den Hash des Browser-Tokens.
-- Admin: fpl_is_admin() (siehe 20261020010000_fpl_threads_auth.sql). Keine E-Mail-Adressen werden ausgeliefert.

create table if not exists public.fplw_reactions (
  issue text not null check (issue ~ '^[0-9]{4}-[0-9]{2}$'),
  target text not null check (target ~ '^(issue|focus|news:[a-z0-9-]{1,60})$'),
  emoji text not null check (emoji in ('👍', '💡', '🤔', '🔥')),
  voter text not null,
  created_at timestamptz not null default now(),
  primary key (issue, target, emoji, voter)
);
create index if not exists fplw_reactions_voter_idx on public.fplw_reactions (voter, created_at);

create table if not exists public.fplw_comments (
  id uuid primary key default gen_random_uuid(),
  issue text not null check (issue ~ '^[0-9]{4}-[0-9]{2}$'),
  target text not null check (target ~ '^(issue|focus|question|news:[a-z0-9-]{1,60})$'),
  parent_id uuid references public.fplw_comments(id) on delete set null,
  body text not null check (char_length(body) between 1 and 1000),
  name text check (name is null or char_length(name) <= 40),
  author_hash text,
  user_id uuid references auth.users(id) on delete set null,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists fplw_comments_issue_idx on public.fplw_comments (issue, created_at);
create index if not exists fplw_comments_author_idx on public.fplw_comments (author_hash, created_at);

create table if not exists public.fplw_poll_votes (
  issue text not null check (issue ~ '^[0-9]{4}-[0-9]{2}$'),
  voter text not null,
  option_idx smallint not null check (option_idx between 0 and 9),
  created_at timestamptz not null default now(),
  primary key (issue, voter)
);

create table if not exists public.fplw_moderation (
  issue text primary key check (issue ~ '^[0-9]{4}-[0-9]{2}$'),
  checked_at timestamptz not null default now(),
  checked_by uuid references auth.users(id) on delete set null,
  checked_by_name text,
  note text check (note is null or char_length(note) <= 300)
);

alter table public.fplw_reactions enable row level security;
alter table public.fplw_comments enable row level security;
alter table public.fplw_poll_votes enable row level security;
alter table public.fplw_moderation enable row level security;
revoke all on public.fplw_reactions, public.fplw_comments, public.fplw_poll_votes, public.fplw_moderation from anon, authenticated;

-- Reaktion setzen bzw. zurücknehmen; gibt zurück, ob sie jetzt gesetzt ist.
create or replace function public.fplw_toggle_reaction(p_issue text, p_target text, p_emoji text, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voter text := fpl_voter(p_token);
  v_n int;
begin
  delete from fplw_reactions r where r.issue = p_issue and r.target = p_target and r.emoji = p_emoji and r.voter = v_voter;
  get diagnostics v_n = row_count;
  if v_n > 0 then return false; end if;
  if (select count(*) from fplw_reactions r where r.voter = v_voter and r.created_at > now() - interval '1 minute') >= 60 then
    raise exception 'rate limit';
  end if;
  insert into fplw_reactions (issue, target, emoji, voter) values (p_issue, p_target, p_emoji, v_voter);
  return true;
end;
$$;

-- Eine Stimme je Besucher, änderbar.
create or replace function public.fplw_poll_vote(p_issue text, p_option int, p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voter text := fpl_voter(p_token);
begin
  if p_option not between 0 and 9 then raise exception 'invalid option'; end if;
  insert into fplw_poll_votes (issue, voter, option_idx) values (p_issue, v_voter, p_option)
  on conflict (issue, voter) do update set option_idx = excluded.option_idx, created_at = now();
end;
$$;

-- Alles Zähl- und Statusmässige einer Ausgabe in einem Aufruf.
create or replace function public.fplw_summary(p_issue text, p_token text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_voter text := case when auth.uid() is not null then 'u:' || auth.uid()::text
                       when p_token is null or length(p_token) < 16 then null
                       else fpl_hash(p_token) end;
begin
  return jsonb_build_object(
    'reactions', coalesce((
      select jsonb_agg(jsonb_build_object('target', x.target, 'emoji', x.emoji, 'count', x.c, 'mine', x.mine))
      from (
        select r.target, r.emoji, count(*) c, coalesce(bool_or(r.voter = v_voter), false) mine
        from fplw_reactions r where r.issue = p_issue group by r.target, r.emoji
      ) x), '[]'::jsonb),
    'poll', coalesce((
      select jsonb_agg(jsonb_build_object('option', x.option_idx, 'count', x.c) order by x.option_idx)
      from (select option_idx, count(*) c from fplw_poll_votes where issue = p_issue group by option_idx) x), '[]'::jsonb),
    'my_poll', (select option_idx from fplw_poll_votes where issue = p_issue and voter = v_voter),
    'moderation', (select jsonb_build_object('checked_at', m.checked_at, 'name', m.checked_by_name, 'note', m.note)
                   from fplw_moderation m where m.issue = p_issue),
    'is_admin', fpl_is_admin()
  );
end;
$$;

create or replace function public.fplw_overview()
returns table (issue text, comments bigint, checked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.issue,
         (select count(*) from fplw_comments c where c.issue = i.issue and not c.hidden),
         m.checked_at
  from (select issue from fplw_comments union select issue from fplw_moderation union select issue from fplw_reactions) i
  left join fplw_moderation m on m.issue = i.issue;
$$;

create or replace function public.fplw_list_comments(p_issue text, p_token text default null)
returns table (id uuid, target text, parent_id uuid, body text, name text, own boolean, can_edit boolean, hidden boolean, created_at timestamptz, edited_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_author text := case when p_token is null or length(p_token) < 16 then null else fpl_hash(p_token) end;
  v_admin boolean := fpl_is_admin();
begin
  return query
  select c.id, c.target, c.parent_id, c.body, c.name,
         coalesce((c.user_id is not null and c.user_id = auth.uid()) or (c.user_id is null and v_author is not null and c.author_hash = v_author), false),
         v_admin or coalesce((c.user_id is not null and c.user_id = auth.uid()) or (c.user_id is null and v_author is not null and c.author_hash = v_author), false),
         c.hidden, c.created_at, c.edited_at
  from fplw_comments c
  where c.issue = p_issue and (v_admin or not c.hidden)
  order by c.created_at, c.id;
end;
$$;

create or replace function public.fplw_add_comment(p_issue text, p_target text, p_body text, p_name text, p_token text, p_parent uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := fpl_hash(p_token);
  v_body text := btrim(coalesce(p_body, ''));
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_parent uuid := p_parent;
  v_id uuid;
begin
  if char_length(v_body) not between 1 and 1000 then raise exception 'invalid text'; end if;
  if v_name is not null and char_length(v_name) > 40 then raise exception 'invalid name'; end if;
  if v_parent is not null then
    -- Antworten sind flach: immer an den obersten Kommentar derselben Ausgabe und Stelle hängen.
    select coalesce(c.parent_id, c.id) into v_parent from fplw_comments c
    where c.id = p_parent and c.issue = p_issue and c.target = p_target;
    if v_parent is null then raise exception 'invalid parent'; end if;
  end if;
  if (select count(*) from fplw_comments c where c.author_hash = v_hash and c.created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'rate limit';
  end if;
  insert into fplw_comments (issue, target, parent_id, body, name, author_hash, user_id)
  values (p_issue, p_target, v_parent, v_body, v_name, v_hash, auth.uid())
  returning fplw_comments.id into v_id;
  return v_id;
end;
$$;

create or replace function public.fplw_can_change_comment(p_id uuid, p_token text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_author text := case when p_token is null or length(p_token) < 16 then null else fpl_hash(p_token) end;
begin
  return fpl_is_admin() or exists (
    select 1 from fplw_comments c where c.id = p_id and (
      (c.user_id is not null and c.user_id = auth.uid())
      or (c.user_id is null and v_author is not null and c.author_hash = v_author)));
end;
$$;

create or replace function public.fplw_edit_comment(p_id uuid, p_body text, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_n int;
begin
  if char_length(v_body) not between 1 and 1000 then raise exception 'invalid text'; end if;
  if not fplw_can_change_comment(p_id, p_token) then return false; end if;
  update fplw_comments set body = v_body, edited_at = now() where id = p_id;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

create or replace function public.fplw_delete_comment(p_id uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if not fplw_can_change_comment(p_id, p_token) then return false; end if;
  delete from fplw_comments where id = p_id;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- Admin: Kommentar aus- bzw. wieder einblenden.
create or replace function public.fplw_hide_comment(p_id uuid, p_hidden boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fpl_is_admin() then raise exception 'not allowed'; end if;
  update fplw_comments set hidden = p_hidden where id = p_id;
  return true;
end;
$$;

-- Admin: Ausgabe als geprüft markieren bzw. zurücknehmen.
create or replace function public.fplw_set_checked(p_issue text, p_checked boolean, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not fpl_is_admin() then raise exception 'not allowed'; end if;
  if p_issue !~ '^[0-9]{4}-[0-9]{2}$' then raise exception 'invalid issue'; end if;
  if not p_checked then
    delete from fplw_moderation where issue = p_issue;
    return false;
  end if;
  select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), 'Moderator') into v_name from auth.users u where u.id = auth.uid();
  insert into fplw_moderation (issue, checked_at, checked_by, checked_by_name, note)
  values (p_issue, now(), auth.uid(), v_name, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (issue) do update set checked_at = now(), checked_by = excluded.checked_by,
    checked_by_name = excluded.checked_by_name, note = excluded.note;
  return true;
end;
$$;

grant execute on function public.fplw_toggle_reaction(text, text, text, text) to anon, authenticated;
grant execute on function public.fplw_poll_vote(text, int, text) to anon, authenticated;
grant execute on function public.fplw_summary(text, text) to anon, authenticated;
grant execute on function public.fplw_overview() to anon, authenticated;
grant execute on function public.fplw_list_comments(text, text) to anon, authenticated;
grant execute on function public.fplw_add_comment(text, text, text, text, text, uuid) to anon, authenticated;
grant execute on function public.fplw_edit_comment(uuid, text, text) to anon, authenticated;
grant execute on function public.fplw_delete_comment(uuid, text) to anon, authenticated;
grant execute on function public.fplw_hide_comment(uuid, boolean) to anon, authenticated;
grant execute on function public.fplw_set_checked(text, boolean, text) to anon, authenticated;
revoke execute on function public.fplw_can_change_comment(uuid, text) from anon, authenticated;
