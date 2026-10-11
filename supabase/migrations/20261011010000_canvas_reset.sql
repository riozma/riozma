-- Canvas komplett zurücksetzen: nur für den Seiten-Admin.
create or replace function public.canvas_reset()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'manuelzeltner@gmail.com' then
    raise exception 'not allowed';
  end if;
  delete from canvas_items where true;
end;
$$;

revoke execute on function public.canvas_reset() from public, anon;
grant execute on function public.canvas_reset() to authenticated;
