-- Blubberbiss: Allzeit-Bestenliste (Solo und Multiplayer), ohne Login.
-- Pro Browser (Hash eines lokalen Tokens) wird nur der beste Wert gespeichert.

create table if not exists public.blubberbiss_scores (
  token_hash text primary key,
  name text not null check (char_length(name) between 1 and 14),
  score integer not null check (score between 1 and 2000000),
  mode text not null check (mode in ('solo', 'multi')),
  tries integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists blubberbiss_scores_score_idx on public.blubberbiss_scores (score desc);

alter table public.blubberbiss_scores enable row level security;
revoke all on public.blubberbiss_scores from anon, authenticated;

-- Lesen nur über die Funktion, damit der Token-Hash nie herausgegeben wird
create or replace function public.blubberbiss_top(p_limit int default 10)
returns table (name text, score integer, mode text, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.name, s.score, s.mode, s.updated_at
  from blubberbiss_scores s
  order by s.score desc, s.updated_at asc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

create or replace function public.blubberbiss_submit(p_name text, p_score integer, p_mode text, p_token text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_name text;
  v_row blubberbiss_scores%rowtype;
begin
  if p_token is null or length(p_token) < 16 then raise exception 'invalid token'; end if;
  if p_score is null or p_score < 1 or p_score > 2000000 then raise exception 'invalid score'; end if;
  if p_mode not in ('solo', 'multi') then raise exception 'invalid mode'; end if;
  v_name := left(regexp_replace(trim(coalesce(p_name, '')), '[<>&"''`]', '', 'g'), 14);
  if v_name = '' then v_name := 'Anonym'; end if;
  v_hash := encode(sha256(convert_to(p_token, 'utf8')), 'hex');

  select * into v_row from blubberbiss_scores where token_hash = v_hash;
  if found then
    -- höchstens 20 Meldungen pro Stunde und Browser
    if v_row.updated_at > now() - interval '1 hour' and v_row.tries >= 20 then raise exception 'rate limit'; end if;
    update blubberbiss_scores set
      tries = case when updated_at > now() - interval '1 hour' then tries + 1 else 1 end,
      name = v_name,
      score = greatest(score, p_score),
      mode = case when p_score > score then p_mode else mode end,
      updated_at = now()
    where token_hash = v_hash;
  else
    insert into blubberbiss_scores (token_hash, name, score, mode, tries) values (v_hash, v_name, p_score, p_mode, 1);
  end if;
  return (select count(*) + 1 from blubberbiss_scores where score > p_score)::integer;
end;
$$;

grant execute on function public.blubberbiss_top(int) to anon, authenticated;
grant execute on function public.blubberbiss_submit(text, integer, text, text) to anon, authenticated;
