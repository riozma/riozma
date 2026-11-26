-- Blubberbiss: «Reichste Fische im Meer». Vermögen = Münzen + Wert der gekauften Accessoires.
-- Pro Browser (Hash eines lokalen Tokens) ein Eintrag; das Vermögen kann auch sinken (Immobilienhai).

create table if not exists public.blubberbiss_wealth (
  token_hash text primary key,
  name text not null check (char_length(name) between 1 and 14),
  wealth bigint not null check (wealth between 0 and 1000000000),
  acc text not null default '' check (char_length(acc) <= 120),
  tries integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists blubberbiss_wealth_idx on public.blubberbiss_wealth (wealth desc);

alter table public.blubberbiss_wealth enable row level security;
revoke all on public.blubberbiss_wealth from anon, authenticated;

create or replace function public.blubberbiss_wealth_top(p_limit int default 10)
returns table (name text, wealth bigint, acc text, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select w.name, w.wealth, w.acc, w.updated_at
  from blubberbiss_wealth w
  where w.wealth > 0
  order by w.wealth desc, w.updated_at asc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

create or replace function public.blubberbiss_wealth_submit(p_name text, p_wealth bigint, p_acc text, p_token text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_name text;
  v_acc text;
  v_row blubberbiss_wealth%rowtype;
begin
  if p_token is null or length(p_token) < 16 then raise exception 'invalid token'; end if;
  if p_wealth is null or p_wealth < 0 or p_wealth > 1000000000 then raise exception 'invalid wealth'; end if;
  v_name := left(regexp_replace(trim(coalesce(p_name, '')), '[<>&"''`]', '', 'g'), 14);
  if v_name = '' then v_name := 'Anonym'; end if;
  v_acc := left(regexp_replace(coalesce(p_acc, ''), '[^a-z,]', '', 'g'), 120);
  v_hash := encode(sha256(convert_to(p_token, 'utf8')), 'hex');

  select * into v_row from blubberbiss_wealth where token_hash = v_hash;
  if found then
    -- höchstens 60 Meldungen pro Stunde und Browser
    if v_row.updated_at > now() - interval '1 hour' and v_row.tries >= 60 then raise exception 'rate limit'; end if;
    update blubberbiss_wealth set
      tries = case when updated_at > now() - interval '1 hour' then tries + 1 else 1 end,
      name = v_name, wealth = p_wealth, acc = v_acc, updated_at = now()
    where token_hash = v_hash;
  else
    insert into blubberbiss_wealth (token_hash, name, wealth, acc, tries) values (v_hash, v_name, p_wealth, v_acc, 1);
  end if;
  return (select count(*) + 1 from blubberbiss_wealth where wealth > p_wealth)::integer;
end;
$$;

grant execute on function public.blubberbiss_wealth_top(int) to anon, authenticated;
grant execute on function public.blubberbiss_wealth_submit(text, bigint, text, text) to anon, authenticated;
