-- FPL Weekly: anonyme Nutzungszahlen (Ausgabe angesehen, Beitrag geöffnet, Originalquelle angeklickt).
-- Damit werden die Beiträge einer Ausgabe nach Interesse sortiert und das Redaktions-Skript (scripts/fpl-weekly-insights.mjs)
-- plant die nächste Ausgabe. Gezählt wird pro Besucher höchstens einmal pro Tag; gespeichert wird nur der Hash des Browser-Tokens
-- (bzw. eine Konto-Kennung), keine Inhalte, keine E-Mail-Adressen.

create table if not exists public.fplw_events (
  issue text not null check (issue ~ '^[0-9]{4}-[0-9]{2}$'),
  target text not null check (target ~ '^(issue|focus|news:[a-z0-9-]{1,60})$'),
  kind text not null check (kind in ('view', 'open', 'click')),
  voter text not null,
  day date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (issue, target, kind, voter, day)
);
create index if not exists fplw_events_issue_idx on public.fplw_events (issue, target, kind);

alter table public.fplw_events enable row level security;
revoke all on public.fplw_events from anon, authenticated;

create or replace function public.fplw_track(p_issue text, p_target text, p_kind text, p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voter text := fpl_voter(p_token);
begin
  if (select count(*) from fplw_events e where e.voter = v_voter and e.created_at > now() - interval '1 minute') >= 120 then
    return; -- zu viele Ereignisse: still ignorieren
  end if;
  insert into fplw_events (issue, target, kind, voter) values (p_issue, p_target, p_kind, v_voter)
  on conflict do nothing;
end;
$$;

-- Zähler je Beitrag (nur Summen von verschiedenen Besuchern, keine personenbezogenen Daten).
-- views = verschiedene Besucher der Ausgabe, opens/clicks/reactions = verschiedene Besucher je Beitrag.
create or replace function public.fplw_stats(p_issue text default null)
returns table (issue text, target text, views bigint, opens bigint, clicks bigint, reactions bigint, comments bigint)
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select e.issue, e.target from fplw_events e
    union select r.issue, r.target from fplw_reactions r
    union select c.issue, c.target from fplw_comments c where c.target like 'news:%' or c.target = 'focus'
  ),
  v as (select e.issue, count(distinct e.voter) n from fplw_events e where e.kind = 'view' and e.target = 'issue' group by e.issue)
  select t.issue, t.target,
         coalesce(v.n, 0),
         (select count(distinct e.voter) from fplw_events e where e.issue = t.issue and e.target = t.target and e.kind = 'open'),
         (select count(distinct e.voter) from fplw_events e where e.issue = t.issue and e.target = t.target and e.kind = 'click'),
         (select count(distinct r.voter) from fplw_reactions r where r.issue = t.issue and r.target = t.target),
         (select count(*) from fplw_comments c where c.issue = t.issue and c.target = t.target and not c.hidden)
  from t left join v on v.issue = t.issue
  where p_issue is null or t.issue = p_issue
  order by t.issue, t.target;
$$;

grant execute on function public.fplw_track(text, text, text, text) to anon, authenticated;
grant execute on function public.fplw_stats(text) to anon, authenticated;
