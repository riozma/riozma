-- Stammbaum: Inhalt und Freigaben. Zugriff nur über die Funktionen unten (kein direkter Tabellenzugriff).

create table if not exists public.stammbaum_content (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.stammbaum_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  notified_at timestamptz
);

alter table public.stammbaum_content enable row level security;
alter table public.stammbaum_access enable row level security;
revoke all on public.stammbaum_content, public.stammbaum_access from anon, authenticated;

-- Einzige Admin-Adresse; die E-Mail muss im Konto bestätigt sein (verhindert Registrierung mit fremder Adresse).
create or replace function public.stammbaum_is_admin()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and lower(u.email) = 'manuelzeltner@gmail.com'
      and u.email_confirmed_at is not null
  );
$$;

create or replace function public.stammbaum_status()
returns text language plpgsql stable security definer set search_path = public, auth as $$
declare s text;
begin
  if auth.uid() is null then return 'anon'; end if;
  if public.stammbaum_is_admin() then return 'admin'; end if;
  select status into s from public.stammbaum_access where user_id = auth.uid();
  return coalesce(s, 'none');
end $$;

create or replace function public.stammbaum_request_access(p_name text, p_message text)
returns text language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); mail text; s text;
begin
  if uid is null then raise exception 'Anmeldung erforderlich'; end if;
  if length(coalesce(p_name, '')) < 2 then raise exception 'Bitte Namen angeben'; end if;
  select email into mail from auth.users where id = uid;
  select status into s from public.stammbaum_access where user_id = uid;
  if s is null then
    insert into public.stammbaum_access (user_id, email, name, message)
    values (uid, coalesce(mail, ''), left(trim(p_name), 120), left(trim(coalesce(p_message, '')), 1000));
    return 'pending';
  end if;
  return s;
end $$;

create or replace function public.stammbaum_get()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not (public.stammbaum_is_admin() or exists (
    select 1 from public.stammbaum_access where user_id = auth.uid() and status = 'approved'
  )) then
    raise exception 'Kein Zugriff' using errcode = '42501';
  end if;
  return (select data from public.stammbaum_content where id = 1);
end $$;

create or replace function public.stammbaum_set(p_data jsonb)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.stammbaum_is_admin() then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  insert into public.stammbaum_content (id, data) values (1, p_data)
  on conflict (id) do update set data = excluded.data, updated_at = now();
end $$;

create or replace function public.stammbaum_list_requests()
returns table (user_id uuid, email text, name text, message text, status text, requested_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.stammbaum_is_admin() then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  return query select a.user_id, a.email, a.name, a.message, a.status, a.requested_at
    from public.stammbaum_access a order by (a.status = 'pending') desc, a.requested_at desc;
end $$;

create or replace function public.stammbaum_decide(p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.stammbaum_is_admin() then raise exception 'Kein Zugriff' using errcode = '42501'; end if;
  if p_status not in ('pending', 'approved', 'denied') then raise exception 'Ungültiger Status'; end if;
  update public.stammbaum_access set status = p_status, decided_at = now() where user_id = p_user;
end $$;

revoke all on function public.stammbaum_is_admin(), public.stammbaum_status(), public.stammbaum_request_access(text, text),
  public.stammbaum_get(), public.stammbaum_set(jsonb), public.stammbaum_list_requests(), public.stammbaum_decide(uuid, text)
  from public, anon;
grant execute on function public.stammbaum_status(), public.stammbaum_request_access(text, text), public.stammbaum_get(),
  public.stammbaum_set(jsonb), public.stammbaum_list_requests(), public.stammbaum_decide(uuid, text) to authenticated;
