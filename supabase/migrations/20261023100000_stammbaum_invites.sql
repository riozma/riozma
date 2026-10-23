-- Stammbaum: E-Mail-Adressen vorab freigeben (Einladung). Wer sich mit einer bestätigten, eingeladenen
-- Adresse anmeldet, hat sofort Zugriff, ohne Anfrage.

create table if not exists public.stammbaum_invites (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.stammbaum_invites enable row level security;
revoke all on public.stammbaum_invites from anon, authenticated;

create or replace function public.stammbaum_has_access()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select public.stammbaum_is_admin()
    or exists (select 1 from public.stammbaum_access where user_id = auth.uid() and status = 'approved')
    or exists (
      select 1 from auth.users u join public.stammbaum_invites i on i.email = lower(u.email)
      where u.id = auth.uid() and u.email_confirmed_at is not null
    );
$$;

create or replace function public.stammbaum_status()
returns text language plpgsql stable security definer set search_path = public, auth as $$
declare s text;
begin
  if auth.uid() is null then return 'anon'; end if;
  if public.stammbaum_is_admin() then return 'admin'; end if;
  if public.stammbaum_has_access() then return 'approved'; end if;
  select status into s from public.stammbaum_access where user_id = auth.uid();
  return coalesce(s, 'none');
end $$;

create or replace function public.stammbaum_get()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.stammbaum_has_access() then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  return (select data from public.stammbaum_content where id = 1);
end $$;

create or replace function public.stammbaum_invite(p_email text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.stammbaum_is_admin() then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Ungültige E-Mail-Adresse'; end if;
  insert into public.stammbaum_invites (email) values (lower(trim(p_email))) on conflict do nothing;
end $$;

create or replace function public.stammbaum_list_invites()
returns table (email text) language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.stammbaum_is_admin() then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  return query select i.email from public.stammbaum_invites i order by i.created_at desc;
end $$;

create or replace function public.stammbaum_remove_invite(p_email text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.stammbaum_is_admin() then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  delete from public.stammbaum_invites where email = lower(trim(p_email));
end $$;

revoke all on function public.stammbaum_has_access(), public.stammbaum_invite(text),
  public.stammbaum_list_invites(), public.stammbaum_remove_invite(text) from public, anon;
grant execute on function public.stammbaum_has_access(), public.stammbaum_invite(text),
  public.stammbaum_list_invites(), public.stammbaum_remove_invite(text) to authenticated;
