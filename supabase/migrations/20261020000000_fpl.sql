-- Future Planning Lab: Post-its zu den fünf Leitfragen, mit Daumen hoch.
-- Zugriff nur über RPC (Besucher werden über den Hash eines lokalen Tokens erkannt).

create table if not exists public.fpl_notes (
  id uuid primary key default gen_random_uuid(),
  q smallint not null check (q between 1 and 5),
  body text not null check (char_length(body) between 1 and 200),
  is_seed boolean not null default false,
  author_hash text,
  created_at timestamptz not null default now()
);

create index if not exists fpl_notes_q_idx on public.fpl_notes (q, created_at);
create index if not exists fpl_notes_author_idx on public.fpl_notes (author_hash, created_at);

create table if not exists public.fpl_votes (
  note_id uuid not null references public.fpl_notes(id) on delete cascade,
  voter_hash text not null,
  created_at timestamptz not null default now(),
  primary key (note_id, voter_hash)
);

create index if not exists fpl_votes_voter_idx on public.fpl_votes (voter_hash, created_at);

alter table public.fpl_notes enable row level security;
alter table public.fpl_votes enable row level security;
revoke all on public.fpl_notes from anon, authenticated;
revoke all on public.fpl_votes from anon, authenticated;

create or replace function public.fpl_hash(p_token text)
returns text
language plpgsql
immutable
as $$
begin
  if p_token is null or length(p_token) < 16 then
    raise exception 'invalid token';
  end if;
  return encode(sha256(convert_to(p_token, 'utf8')), 'hex');
end;
$$;

create or replace function public.fpl_list(p_token text default null)
returns table (id uuid, q smallint, body text, is_seed boolean, votes bigint, mine boolean, own boolean, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := case when p_token is null or length(p_token) < 16 then null else fpl_hash(p_token) end;
begin
  return query
  select n.id, n.q, n.body, n.is_seed,
         (select count(*) from fpl_votes v where v.note_id = n.id),
         coalesce(v_hash is not null and exists (select 1 from fpl_votes v where v.note_id = n.id and v.voter_hash = v_hash), false),
         coalesce(v_hash is not null and n.author_hash = v_hash, false),
         n.created_at
  from fpl_notes n
  order by n.created_at, n.id;
end;
$$;

create or replace function public.fpl_add_note(p_q int, p_body text, p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := fpl_hash(p_token);
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if p_q not between 1 and 5 then raise exception 'invalid question'; end if;
  if char_length(v_body) not between 1 and 200 then raise exception 'invalid text'; end if;
  if (select count(*) from fpl_notes n where n.author_hash = v_hash and n.created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'rate limit';
  end if;
  insert into fpl_notes (q, body, author_hash) values (p_q, v_body, v_hash) returning fpl_notes.id into v_id;
  return v_id;
end;
$$;

-- Daumen setzen bzw. wieder zurücknehmen; gibt zurück, ob der Daumen jetzt gesetzt ist.
create or replace function public.fpl_toggle_vote(p_note uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := fpl_hash(p_token);
  v_n int;
begin
  delete from fpl_votes v where v.note_id = p_note and v.voter_hash = v_hash;
  get diagnostics v_n = row_count;
  if v_n > 0 then return false; end if;
  if (select count(*) from fpl_votes v where v.voter_hash = v_hash and v.created_at > now() - interval '1 minute') >= 60 then
    raise exception 'rate limit';
  end if;
  insert into fpl_votes (note_id, voter_hash) values (p_note, v_hash);
  return true;
end;
$$;

create or replace function public.fpl_delete_note(p_note uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := fpl_hash(p_token);
  v_n int;
begin
  delete from fpl_notes n where n.id = p_note and n.author_hash = v_hash;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

grant execute on function public.fpl_list(text) to anon, authenticated;
grant execute on function public.fpl_add_note(int, text, text) to anon, authenticated;
grant execute on function public.fpl_toggle_vote(uuid, text) to anon, authenticated;
grant execute on function public.fpl_delete_note(uuid, text) to anon, authenticated;

-- Post-its vom Kick-off (Fragenplakate)
insert into public.fpl_notes (q, body, is_seed) values
  (1, 'Through engineers who finished university recently', true),
  (1, 'Through seminars', true),
  (1, 'Through literature (magazines & books)', true),
  (1, 'Through peers', true),
  (1, 'Through social media (LinkedIn, YouTube …)', true),
  (1, 'Through standards?', true),
  (2, 'To look through literature and standards', true),
  (2, 'To organize existing plans', true),
  (2, 'For repetitive tasks', true),
  (2, 'To create different variants', true),
  (2, 'For knowledge transfer between project phases', true),
  (2, 'To write custom software for a very specific engineering problem', true),
  (2, 'Like to write the „Leistungsverzeichnis“', true),
  (2, 'To write reports', true),
  (2, 'Owner requirements', true),
  (2, 'Through software features', true),
  (3, 'Everything builds up on experience.', true),
  (3, 'Software which locks you in', true),
  (3, 'No incentive to innovate for owners', true),
  (3, 'Everything needs to be tested first. No room for failure', true),
  (3, 'No incentive for planners to innovate', true),
  (3, 'Only contractors have incentive to innovate', true),
  (3, 'And owners which build a lot.', true),
  (3, 'Fragmented industry', true),
  (3, 'No time to innovate', true),
  (3, 'Honorary rules', true),
  (4, 'Circular construction', true),
  (4, 'More existing building-stock projects', true),
  (4, 'Industrialized construction', true),
  (4, 'BIM', true),
  (4, 'AI (as everywhere :) )', true),
  (5, 'Data & programming knowledge', true),
  (5, 'Understand digital methods', true),
  (5, 'Interdisciplinary knowledge and exchange', true),
  (5, 'Use AI responsibly and efficient', true),
  (5, 'Have an oversight on the best software and use them efficient', true),
  (5, 'Deep technical knowledge', true),
  (5, 'To evaluate output from computer', true),
  (5, 'To design better & more creative', true),
  (5, 'To be brave enough to put new ideas into practice', true),
  (5, 'System thinking', true),
  (5, 'Where to get them: from lectures & study sessions', true),
  (5, 'Where to get them: from the internet', true);
