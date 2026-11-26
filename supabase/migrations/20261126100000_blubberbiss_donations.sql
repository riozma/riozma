-- Blubberbiss: Spenden an die Nurija-Stiftung (öffentliche Spenderliste).

alter table public.blubberbiss_wealth add column if not exists donated bigint not null default 0 check (donated between 0 and 1000000000);

create or replace function public.blubberbiss_wealth_submit(p_name text, p_wealth bigint, p_acc text, p_token text, p_donated bigint)
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
  if p_donated is null or p_donated < 0 or p_donated > 1000000000 then raise exception 'invalid donation'; end if;
  v_name := left(regexp_replace(trim(coalesce(p_name, '')), '[<>&"''`]', '', 'g'), 14);
  if v_name = '' then v_name := 'Anonym'; end if;
  v_acc := left(regexp_replace(coalesce(p_acc, ''), '[^a-z,]', '', 'g'), 120);
  v_hash := encode(sha256(convert_to(p_token, 'utf8')), 'hex');

  select * into v_row from blubberbiss_wealth where token_hash = v_hash;
  if found then
    if v_row.updated_at > now() - interval '1 hour' and v_row.tries >= 60 then raise exception 'rate limit'; end if;
    update blubberbiss_wealth set
      tries = case when updated_at > now() - interval '1 hour' then tries + 1 else 1 end,
      name = v_name, wealth = p_wealth, acc = v_acc, donated = greatest(donated, p_donated), updated_at = now()
    where token_hash = v_hash;
  else
    insert into blubberbiss_wealth (token_hash, name, wealth, acc, donated, tries) values (v_hash, v_name, p_wealth, v_acc, p_donated, 1);
  end if;
  return (select count(*) + 1 from blubberbiss_wealth where wealth > p_wealth)::integer;
end;
$$;

create or replace function public.blubberbiss_donors_top(p_limit int default 10)
returns table (name text, donated bigint)
language sql
stable
security definer
set search_path = public
as $$
  select w.name, w.donated from blubberbiss_wealth w
  where w.donated > 0
  order by w.donated desc, w.updated_at asc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

grant execute on function public.blubberbiss_wealth_submit(text, bigint, text, text, bigint) to anon, authenticated;
grant execute on function public.blubberbiss_donors_top(int) to anon, authenticated;
