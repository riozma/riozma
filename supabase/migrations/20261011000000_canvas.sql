-- Gemeinsamer Canvas: alle Besucher können zeichnen, stempeln, Text und Formen hinzufügen.

create table if not exists public.canvas_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('stroke', 'stamp', 'text', 'shape')),
  data jsonb not null check (pg_column_size(data) < 30000),
  created_at timestamptz not null default now()
);

create index if not exists canvas_items_created_idx on public.canvas_items (created_at);

-- Zuordnung Element -> Besucher (Hash des lokalen Tokens), nur intern lesbar.
create table if not exists public.canvas_owners (
  item_id uuid primary key references public.canvas_items(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists canvas_owners_token_idx on public.canvas_owners (token_hash, created_at);

alter table public.canvas_items enable row level security;
alter table public.canvas_owners enable row level security;

drop policy if exists canvas_items_read on public.canvas_items;
create policy canvas_items_read on public.canvas_items for select to anon, authenticated using (true);

revoke insert, update, delete on public.canvas_items from anon, authenticated;
revoke all on public.canvas_owners from anon, authenticated;

create or replace function public.canvas_add(p_kind text, p_data jsonb, p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_id uuid;
begin
  if p_token is null or length(p_token) < 16 then
    raise exception 'invalid token';
  end if;
  v_hash := encode(sha256(convert_to(p_token, 'utf8')), 'hex');
  if (select count(*) from canvas_owners o where o.token_hash = v_hash and o.created_at > now() - interval '1 minute') >= 120 then
    raise exception 'rate limit';
  end if;
  insert into canvas_items (kind, data) values (p_kind, p_data) returning id into v_id;
  insert into canvas_owners (item_id, token_hash) values (v_id, v_hash);
  return v_id;
end;
$$;

create or replace function public.canvas_undo(p_id uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_n int;
begin
  if p_token is null or length(p_token) < 16 then
    return false;
  end if;
  v_hash := encode(sha256(convert_to(p_token, 'utf8')), 'hex');
  delete from canvas_items i
  using canvas_owners o
  where i.id = p_id and o.item_id = i.id and o.token_hash = v_hash;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

grant execute on function public.canvas_add(text, jsonb, text) to anon, authenticated;
grant execute on function public.canvas_undo(uuid, text) to anon, authenticated;

alter publication supabase_realtime add table public.canvas_items;
